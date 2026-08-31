import { NextResponse } from "next/server";
import { prisma } from "@fantazia/db";
import { storeImage, MediaError } from "@fantazia/media/store";
import { getActor } from "@/server/auth";
import { audit } from "@/server/audit";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!actor.permissions.has("media:write")) {
    return NextResponse.json({ error: "You cannot upload media" }, { status: 403 });
  }

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file was sent" }, { status: 400 });
  }

  try {
    const stored = await storeImage({
      buffer: Buffer.from(await file.arrayBuffer()),
      mime: file.type,
      originalName: file.name,
    });

    const asset = await prisma.mediaAsset.create({
      data: {
        storageKey: stored.storageKey,
        mime: stored.mime,
        width: stored.width,
        height: stored.height,
        bytes: stored.bytes,
        placeholder: stored.placeholder,
        originalName: file.name,
        uploadedById: actor.id,
        translations: {
          create: [{ localeCode: "en", alt: "" }],
        },
      },
    });

    await audit(actor, "media.upload", "MediaAsset", asset.id, null, {
      storageKey: asset.storageKey,
      originalName: file.name,
      bytes: stored.bytes,
    });

    return NextResponse.json({
      id: asset.id,
      storageKey: asset.storageKey,
      width: asset.width,
      height: asset.height,
      placeholder: asset.placeholder,
    });
  } catch (error) {
    if (error instanceof MediaError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("media upload failed", error);
    return NextResponse.json(
      { error: "That upload could not be processed." },
      { status: 500 },
    );
  }
}

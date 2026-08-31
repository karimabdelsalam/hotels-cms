-- AlterTable
ALTER TABLE "translation_strings" ADD COLUMN     "editedById" TEXT,
ADD COLUMN     "humanEdited" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "machineAt" TIMESTAMP(3),
ADD COLUMN     "machineModel" TEXT;

-- CreateIndex
CREATE INDEX "translation_strings_localeCode_humanEdited_idx" ON "translation_strings"("localeCode", "humanEdited");

-- AddForeignKey
ALTER TABLE "translation_strings" ADD CONSTRAINT "translation_strings_editedById_fkey" FOREIGN KEY ("editedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

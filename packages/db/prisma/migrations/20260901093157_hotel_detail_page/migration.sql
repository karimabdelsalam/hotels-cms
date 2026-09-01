-- AlterTable
ALTER TABLE "experiences" ADD COLUMN     "resortId" TEXT;

-- AlterTable
ALTER TABLE "resorts" ADD COLUMN     "brandId" TEXT;

-- AlterTable
ALTER TABLE "restaurants" ADD COLUMN     "menuMediaId" TEXT,
ADD COLUMN     "reservationUrl" TEXT;

-- CreateTable
CREATE TABLE "brands" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "logoMediaId" TEXT,
    "heroMediaId" TEXT,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'published',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "brands_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "brand_translations" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "localeCode" VARCHAR(12) NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "tagline" TEXT,
    "description" TEXT,

    CONSTRAINT "brand_translations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "facilities" (
    "id" TEXT NOT NULL,
    "resortId" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'general',
    "icon" TEXT,
    "openingHours" TEXT,
    "heroMediaId" TEXT,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'published',

    CONSTRAINT "facilities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "facility_translations" (
    "id" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "localeCode" VARCHAR(12) NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "facility_translations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resort_policies" (
    "id" TEXT NOT NULL,
    "resortId" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'general',
    "displayOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "resort_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resort_policy_translations" (
    "id" TEXT NOT NULL,
    "policyId" TEXT NOT NULL,
    "localeCode" VARCHAR(12) NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,

    CONSTRAINT "resort_policy_translations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "faqs" (
    "id" TEXT NOT NULL,
    "resortId" TEXT,
    "category" TEXT NOT NULL DEFAULT 'general',
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'published',

    CONSTRAINT "faqs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "faq_translations" (
    "id" TEXT NOT NULL,
    "faqId" TEXT NOT NULL,
    "localeCode" VARCHAR(12) NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,

    CONSTRAINT "faq_translations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nearby_attractions" (
    "id" TEXT NOT NULL,
    "resortId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'attraction',
    "distanceKm" DOUBLE PRECISION,
    "travelMinutes" INTEGER,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "heroMediaId" TEXT,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "nearby_attractions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nearby_attraction_translations" (
    "id" TEXT NOT NULL,
    "attractionId" TEXT NOT NULL,
    "localeCode" VARCHAR(12) NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "nearby_attraction_translations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "venues" (
    "id" TEXT NOT NULL,
    "resortId" TEXT NOT NULL,
    "areaSqm" DOUBLE PRECISION,
    "ceilingM" DOUBLE PRECISION,
    "daylight" BOOLEAN NOT NULL DEFAULT false,
    "heroMediaId" TEXT,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'published',

    CONSTRAINT "venues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "venue_translations" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "localeCode" VARCHAR(12) NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "equipment" TEXT,

    CONSTRAINT "venue_translations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "venue_layouts" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "layout" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL,

    CONSTRAINT "venue_layouts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "venue_media" (
    "venueId" TEXT NOT NULL,
    "mediaId" TEXT NOT NULL,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "venue_media_pkey" PRIMARY KEY ("venueId","mediaId")
);

-- CreateTable
CREATE TABLE "reviews" (
    "id" TEXT NOT NULL,
    "resortId" TEXT NOT NULL,
    "bookingId" TEXT,
    "source" TEXT NOT NULL DEFAULT 'direct',
    "guestName" TEXT NOT NULL,
    "guestCountry" TEXT,
    "stayedAt" TIMESTAMP(3),
    "title" TEXT,
    "body" TEXT NOT NULL,
    "localeCode" VARCHAR(12) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_category_scores" (
    "reviewId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "score" INTEGER NOT NULL,

    CONSTRAINT "review_category_scores_pkey" PRIMARY KEY ("reviewId","category")
);

-- CreateTable
CREATE TABLE "resort_sections" (
    "resortId" TEXT NOT NULL,
    "section" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "resort_sections_pkey" PRIMARY KEY ("resortId","section")
);

-- CreateTable
CREATE TABLE "restaurant_media" (
    "restaurantId" TEXT NOT NULL,
    "mediaId" TEXT NOT NULL,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "restaurant_media_pkey" PRIMARY KEY ("restaurantId","mediaId")
);

-- CreateIndex
CREATE UNIQUE INDEX "brands_code_key" ON "brands"("code");

-- CreateIndex
CREATE INDEX "brand_translations_localeCode_slug_idx" ON "brand_translations"("localeCode", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "brand_translations_brandId_localeCode_key" ON "brand_translations"("brandId", "localeCode");

-- CreateIndex
CREATE INDEX "facilities_resortId_status_idx" ON "facilities"("resortId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "facility_translations_facilityId_localeCode_key" ON "facility_translations"("facilityId", "localeCode");

-- CreateIndex
CREATE INDEX "resort_policies_resortId_idx" ON "resort_policies"("resortId");

-- CreateIndex
CREATE UNIQUE INDEX "resort_policy_translations_policyId_localeCode_key" ON "resort_policy_translations"("policyId", "localeCode");

-- CreateIndex
CREATE INDEX "faqs_resortId_status_idx" ON "faqs"("resortId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "faq_translations_faqId_localeCode_key" ON "faq_translations"("faqId", "localeCode");

-- CreateIndex
CREATE INDEX "nearby_attractions_resortId_idx" ON "nearby_attractions"("resortId");

-- CreateIndex
CREATE UNIQUE INDEX "nearby_attraction_translations_attractionId_localeCode_key" ON "nearby_attraction_translations"("attractionId", "localeCode");

-- CreateIndex
CREATE INDEX "venues_resortId_status_idx" ON "venues"("resortId", "status");

-- CreateIndex
CREATE INDEX "venue_translations_localeCode_slug_idx" ON "venue_translations"("localeCode", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "venue_translations_venueId_localeCode_key" ON "venue_translations"("venueId", "localeCode");

-- CreateIndex
CREATE UNIQUE INDEX "venue_layouts_venueId_layout_key" ON "venue_layouts"("venueId", "layout");

-- CreateIndex
CREATE INDEX "reviews_resortId_status_publishedAt_idx" ON "reviews"("resortId", "status", "publishedAt");

-- AddForeignKey
ALTER TABLE "resorts" ADD CONSTRAINT "resorts_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "brands"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "restaurants" ADD CONSTRAINT "restaurants_menuMediaId_fkey" FOREIGN KEY ("menuMediaId") REFERENCES "media_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "experiences" ADD CONSTRAINT "experiences_resortId_fkey" FOREIGN KEY ("resortId") REFERENCES "resorts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "brands" ADD CONSTRAINT "brands_logoMediaId_fkey" FOREIGN KEY ("logoMediaId") REFERENCES "media_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "brands" ADD CONSTRAINT "brands_heroMediaId_fkey" FOREIGN KEY ("heroMediaId") REFERENCES "media_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "brand_translations" ADD CONSTRAINT "brand_translations_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "brands"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "brand_translations" ADD CONSTRAINT "brand_translations_localeCode_fkey" FOREIGN KEY ("localeCode") REFERENCES "locales"("code") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "facilities" ADD CONSTRAINT "facilities_resortId_fkey" FOREIGN KEY ("resortId") REFERENCES "resorts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "facilities" ADD CONSTRAINT "facilities_heroMediaId_fkey" FOREIGN KEY ("heroMediaId") REFERENCES "media_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "facility_translations" ADD CONSTRAINT "facility_translations_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "facilities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "facility_translations" ADD CONSTRAINT "facility_translations_localeCode_fkey" FOREIGN KEY ("localeCode") REFERENCES "locales"("code") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resort_policies" ADD CONSTRAINT "resort_policies_resortId_fkey" FOREIGN KEY ("resortId") REFERENCES "resorts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resort_policy_translations" ADD CONSTRAINT "resort_policy_translations_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "resort_policies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resort_policy_translations" ADD CONSTRAINT "resort_policy_translations_localeCode_fkey" FOREIGN KEY ("localeCode") REFERENCES "locales"("code") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "faqs" ADD CONSTRAINT "faqs_resortId_fkey" FOREIGN KEY ("resortId") REFERENCES "resorts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "faq_translations" ADD CONSTRAINT "faq_translations_faqId_fkey" FOREIGN KEY ("faqId") REFERENCES "faqs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "faq_translations" ADD CONSTRAINT "faq_translations_localeCode_fkey" FOREIGN KEY ("localeCode") REFERENCES "locales"("code") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nearby_attractions" ADD CONSTRAINT "nearby_attractions_resortId_fkey" FOREIGN KEY ("resortId") REFERENCES "resorts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nearby_attractions" ADD CONSTRAINT "nearby_attractions_heroMediaId_fkey" FOREIGN KEY ("heroMediaId") REFERENCES "media_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nearby_attraction_translations" ADD CONSTRAINT "nearby_attraction_translations_attractionId_fkey" FOREIGN KEY ("attractionId") REFERENCES "nearby_attractions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nearby_attraction_translations" ADD CONSTRAINT "nearby_attraction_translations_localeCode_fkey" FOREIGN KEY ("localeCode") REFERENCES "locales"("code") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "venues" ADD CONSTRAINT "venues_resortId_fkey" FOREIGN KEY ("resortId") REFERENCES "resorts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "venues" ADD CONSTRAINT "venues_heroMediaId_fkey" FOREIGN KEY ("heroMediaId") REFERENCES "media_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "venue_translations" ADD CONSTRAINT "venue_translations_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "venues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "venue_translations" ADD CONSTRAINT "venue_translations_localeCode_fkey" FOREIGN KEY ("localeCode") REFERENCES "locales"("code") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "venue_layouts" ADD CONSTRAINT "venue_layouts_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "venues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "venue_media" ADD CONSTRAINT "venue_media_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "venues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "venue_media" ADD CONSTRAINT "venue_media_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "media_assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_resortId_fkey" FOREIGN KEY ("resortId") REFERENCES "resorts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_category_scores" ADD CONSTRAINT "review_category_scores_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "reviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resort_sections" ADD CONSTRAINT "resort_sections_resortId_fkey" FOREIGN KEY ("resortId") REFERENCES "resorts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "restaurant_media" ADD CONSTRAINT "restaurant_media_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "restaurant_media" ADD CONSTRAINT "restaurant_media_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "media_assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

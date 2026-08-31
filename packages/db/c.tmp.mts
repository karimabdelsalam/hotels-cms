import { prisma } from "./src/index";
async function main() {
  console.log("placeholder assets:", await prisma.mediaAsset.count({ where: { isPlaceholder: true } }));
  console.log("restaurants       :", await prisma.restaurant.count());
  await prisma.$disconnect();
}
main();

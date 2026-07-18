// Seeds the database with the assignment's reference data:
// user "john_doe" with three pending ₹40 sales for brand_1.
//
// Run with:  npm run seed

const prisma = require('../src/config/db');
const { SaleStatus } = require('../src/domain/enums');
const { rupeesToPaise } = require('../src/domain/money');

async function main() {
  // Clean slate so the seed is repeatable.
  await prisma.ledgerEntry.deleteMany();
  await prisma.payout.deleteMany();
  await prisma.sale.deleteMany();
  await prisma.user.deleteMany();

  const user = await prisma.user.create({
    data: { name: 'John Doe', email: 'john_doe@example.com' },
  });

  const sales = [
    { brand: 'brand_1', earning: 40 },
    { brand: 'brand_1', earning: 40 },
    { brand: 'brand_1', earning: 40 },
  ];

  for (const s of sales) {
    await prisma.sale.create({
      data: {
        userId: user.id,
        brand: s.brand,
        earning: rupeesToPaise(s.earning),
        status: SaleStatus.PENDING,
      },
    });
  }

  // eslint-disable-next-line no-console
  console.log(
    `Seeded user #${user.id} (john_doe) with ${sales.length} pending sales of ₹40 each.\n` +
      `Total pending earnings: ₹120  ->  expected advance payout: ₹12.`,
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });

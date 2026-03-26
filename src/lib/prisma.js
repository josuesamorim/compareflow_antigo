import { PrismaClient } from '@prisma/client'

// const connectionString = process.env.NODE_ENV === 'production' 
//   ? process.env.DATABASE_URL_SUPABASE 
//   : process.env.DATABASE_URL_LOCAL;

  const connectionString = process.env.DATABASE_URL;

const prismaClientSingleton = () => {
  return new PrismaClient({
    datasources: {
      db: {
        url: connectionString,
      },
    },
  })
}

const globalForPrisma = global;

export const prisma = globalForPrisma.prisma || prismaClientSingleton()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
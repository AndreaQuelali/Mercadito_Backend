/*
  Warnings:

  - Changed the type of `unit` on the `Product` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `category` on the `Product` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- CreateEnum
CREATE TYPE "Category" AS ENUM ('verduras', 'frutas', 'panaderia', 'lacteos', 'artesanias');

-- CreateEnum
CREATE TYPE "Unit" AS ENUM ('kilogramo', 'unidad', 'frasco', 'litro');

-- AlterTable
ALTER TABLE "Product" DROP COLUMN "unit",
ADD COLUMN     "unit" "Unit" NOT NULL,
DROP COLUMN "category",
ADD COLUMN     "category" "Category" NOT NULL;

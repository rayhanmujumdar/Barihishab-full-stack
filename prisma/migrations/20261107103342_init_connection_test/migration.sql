-- CreateTable
CREATE TABLE "connection_tests" (
    "id" SERIAL NOT NULL,
    "message" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "connection_tests_pkey" PRIMARY KEY ("id")
);

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  runVerifyKycAdmin,
  runVerifyKycPaystack,
  runListNigerianBanks,
  runVerifyKycDocumentAdmin,
  runRejectKycDocument,
} from "@/server/kyc.server";

const VerifyInput = z.object({
  userId: z.string().uuid(),
  accountNumber: z.string().regex(/^\d{10}$/, "Account number must be 10 digits"),
  accessToken: z.string().min(1),
});

export const verifyKycServer = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => VerifyInput.parse(input))
  .handler(async ({ data }) => runVerifyKycAdmin(data));

const VerifyDocumentInput = z.object({
  userId: z.string().uuid(),
  accessToken: z.string().min(1),
});

export const verifyKycDocumentServer = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => VerifyDocumentInput.parse(input))
  .handler(async ({ data }) => runVerifyKycDocumentAdmin(data));

const RejectDocumentInput = z.object({
  userId: z.string().uuid(),
  reason: z.string().max(500),
  accessToken: z.string().min(1),
});

export const rejectKycDocumentServer = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => RejectDocumentInput.parse(input))
  .handler(async ({ data }) => runRejectKycDocument(data));

export const listNigerianBanks = createServerFn({ method: "GET" }).handler(
  async () => runListNigerianBanks(),
);

const ResolveInput = z.object({
  accessToken: z.string().min(1),
  accountNumber: z.string().regex(/^\d{10}$/, "Account number must be 10 digits"),
  bankCode: z.string().min(2).max(10),
  bankName: z.string().min(2).max(120),
});

export const verifyKycPaystack = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => ResolveInput.parse(input))
  .handler(async ({ data }) => runVerifyKycPaystack(data));
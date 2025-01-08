"use server";

import { db } from "@/app/_lib/prisma";
import OpenAI from "openai";
import { GenerateAiReportSchema, generateAiReportSchema } from "./schema";
import { auth, clerkClient } from "@clerk/nextjs/server";

const DUMMY_REPORT =
  "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed non risus. Suspendisse lectus tortor, dignissim sit amet, adipiscing nec, ultricies sed, dolor.";

export const generateAiReport = async ({ month }: GenerateAiReportSchema) => {
  const { userId } = await auth();
  if (!userId) {
    throw new Error("Unauthorized");
  }

  const user = await clerkClient().users.getUser(userId);
  const hasPremiumPlan = user.publicMetadata.subscriptionPlan === "premium";
  if (!hasPremiumPlan) {
    throw new Error("You need a premium plan to generate AI reports");
  }

  if (!process.env.OPENAI_API_KEY) {
    await new Promise((resolve) => setTimeout(resolve, 5000));
    return DUMMY_REPORT;
  }

  const openAi = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  generateAiReportSchema.parse({ month });

  // pegar as transações do mês recebido
  const transactions = await db.transaction.findMany({
    where: {
      date: {
        gte: new Date(`2024-${month}-01`),
        lt: new Date(`2024-${month}-31`),
      },
    },
  });
  // mandar as transações para o ChatGPT e pedir para ele gerar um relatório com insights

  const content = `Gere um relatório sobre as minhas finanças, com dicas e orientações para melhorar a minha situação financeira. As transações estão divididas por ponto e vírgula. A estrutura de cada uma é {DATA}-{TIPO}-{VALOR}-{CATEGORIA}. São elas:
  ${transactions.map((transaction) => `${transaction.date.toLocaleDateString("pt-BR")}-R$${transaction.amount}-${transaction.type}-${transaction.category}`).join(";")}`;

  const completion = await openAi.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content:
          "Você é um especialista em gestão de finanças pessoais. Você ajuda as pessoas a organizarem suas finanças e a tomarem decisões financeiras melhores.",
      },
      {
        role: "user",
        content,
      },
    ],
  });

  // pegar o relatório gerado e retornar para o usuário
  return completion.choices[0].message.content;
};

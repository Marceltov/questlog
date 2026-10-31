import { chatRoute } from "@/backend";

// The in-app chat (ADR 0013); backend/chat-route.ts decides who may call it and answers.
export const POST = chatRoute;
export const GET = chatRoute;

import { z } from "zod";
import { findUserByEmail, startSession } from "@/server/auth";
import { HttpError, route } from "@/server/http";

const Body = z.object({ email: z.string().email(), password: z.string().min(1) });

/** E-mail + any password (as the PRD asks); only seeded users can log in. */
export const POST = route(async (req: Request) => {
  const { email } = Body.parse(await req.json());
  const user = await findUserByEmail(email);
  if (!user) throw new HttpError(401, "E-mail não encontrado. Use um e-mail corporativo da Nexo.");
  await startSession(user);
  return Response.json({ role: user.role, redirect: user.role === "analyst" ? "/console" : "/chat" });
});

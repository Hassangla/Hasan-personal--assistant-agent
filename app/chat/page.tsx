import { redirect } from "next/navigation";

// Chat is now a floating widget available on every page (see ChatWidget in the
// root layout), so the dedicated page just sends you home.
export default function ChatPage() {
  redirect("/");
}

"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

export default function LoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);

    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });

    if (response.ok) {
      router.push("/");
      router.refresh();
      return;
    }

    setError("Wrong password.");
    setPending(false);
  }

  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-md border border-ink-2 bg-ink-1 p-6"
      >
        <h1 className="mb-4 font-mono text-sm text-ink-3">Stone Transport Ops OS</h1>
        <label htmlFor="password" className="mb-1 block text-sm text-ink-4">
          Password
        </label>
        <input
          id="password"
          type="password"
          autoFocus
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="mb-4 w-full rounded border border-ink-2 bg-ink-0 px-3 py-2 font-mono text-ink-4 outline-none focus:border-accent"
        />
        {error && <p className="mb-4 text-sm text-hot">{error}</p>}
        <button
          type="submit"
          disabled={pending}
          className="w-full rounded bg-accent px-3 py-2 text-sm font-medium text-ink-0 disabled:opacity-50"
        >
          {pending ? "Checking…" : "Enter"}
        </button>
      </form>
    </div>
  );
}

import { Footer, Header } from "@/components/site-chrome";
import { Button } from "@/components/ui/button";
import { supabaseConfigured } from "@/lib/supabase/env";
import { login, signInWithGithub, signup } from "./actions";

interface PageProps {
  searchParams: Promise<{ error?: string }>;
}

export const metadata = {
  title: "Login | opendungeon",
};

export default async function LoginPage({ searchParams }: PageProps) {
  const { error } = await searchParams;
  const configured = supabaseConfigured();

  return (
    <main data-page="opendungeon">
      <div data-component="container">
        <Header />
        <article data-component="docs">
          <p data-slot="eyebrow">Supabase</p>
          <h1>Login</h1>
          <p>
            Use Supabase Auth to link a website profile to future cloud saves,
            generated worlds, and lobby metadata.
          </p>
          {configured ? null : (
            <p data-slot="notice">
              Set NEXT_PUBLIC_SUPABASE_URL and
              NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY to enable auth.
            </p>
          )}
          {error ? <p data-slot="notice">{error}</p> : null}

          <form data-component="auth-form">
            <label>
              <span>Email</span>
              <input
                autoComplete="email"
                disabled={!configured}
                name="email"
                required
                type="email"
              />
            </label>
            <label>
              <span>Password</span>
              <input
                autoComplete="current-password"
                disabled={!configured}
                minLength={6}
                name="password"
                required
                type="password"
              />
            </label>
            <div data-slot="auth-actions">
              <Button disabled={!configured} formAction={login} type="submit">
                Log in
              </Button>
              <Button
                disabled={!configured}
                formAction={signup}
                type="submit"
                variant="outline"
              >
                Sign up
              </Button>
            </div>
          </form>

          <form action={signInWithGithub}>
            <Button disabled={!configured} type="submit" variant="secondary">
              Continue with GitHub
            </Button>
          </form>
        </article>
        <Footer />
      </div>
    </main>
  );
}

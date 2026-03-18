import { auth } from "@/auth";
import { InlineLogin } from "@/components/inline-login";
import { SpaHome } from "@/components/spa-home";

type HomePageProps = {
  searchParams?: Promise<{
    error?: string;
    verify?: string;
    email?: string;
    resetToken?: string;
  }>;
};

export default async function HomePage({ searchParams }: HomePageProps) {
  const session = await auth();
  const params = searchParams ? await searchParams : undefined;

  if (!session?.user) {
    return (
      <InlineLogin
        initialError={params?.error}
        verificationToken={params?.verify}
        verificationEmail={params?.email}
        resetToken={params?.resetToken}
      />
    );
  }

  return <SpaHome />;
}

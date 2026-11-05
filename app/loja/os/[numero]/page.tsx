import type { Metadata } from 'next';
import { FichaOs } from '@/components/os/ficha';

export async function generateMetadata({ params }: { params: Promise<{ numero: string }> }): Promise<Metadata> {
  return { title: `OS ${(await params).numero}` };
}

export default async function Page({ params, searchParams }: { params: Promise<{ numero: string }>; searchParams: Promise<{ nova?: string }> }) {
  const [{ numero }, { nova }] = await Promise.all([params, searchParams]);
  return <FichaOs numero={numero} modo="loja" nova={!!nova} />;
}

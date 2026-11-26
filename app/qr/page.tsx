'use client';
import { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Logo } from '@/components/ui';

export default function QrPage() {
  const [url, setUrl] = useState('');
  useEffect(() => {
    const demo = new URL(window.location.href).searchParams.get('e') === 'demo';
    setUrl(`${window.location.origin}${demo ? '/demo' : '/'}`);
  }, []);
  return (
    <main className="flex min-h-[100dvh] flex-col items-center justify-center gap-6 p-6 text-center">
      <Logo />
      <div className="text-2xl font-bold">휴대폰 카메라로 QR코드를 찍어 입장하세요</div>
      {url && <div className="rounded-3xl bg-white p-6"><QRCodeSVG value={url} size={320} /></div>}
      <div className="text-2xl font-black text-gold break-all">{url}</div>
    </main>
  );
}

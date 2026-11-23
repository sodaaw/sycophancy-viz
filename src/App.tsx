import { useEffect, useState } from 'react';
import { SessionProvider, useSession } from './session';
import { S0 } from './screens/S0';
import { S1, S1Intro } from './screens/S1';
import { S2 } from './screens/S2';
import { S3 } from './screens/S3';
import { S4 } from './screens/S4';
import { S5 } from './screens/S5';
import { S6 } from './screens/S6';

const ID_RE = /^(S2-P\d{2,3}|TEST)$/; // 'TEST' 는 자유 테스트용 (연구자 페이지·export 에는 나오지 않음)

function Shell() {
  const { session, restore } = useSession();
  const [booting, setBooting] = useState(true);

  useEffect(() => {
    const id = new URLSearchParams(location.search).get('id');
    if (id && ID_RE.test(id)) void restore(id).finally(() => setBooting(false));
    else setBooting(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (booting) return null;
  if (!session) return <S0 />;
  switch (session.screen) {
    case 'S1-intro':
      return <S1Intro />;
    case 'S1':
      return <S1 />;
    case 'S2':
      return <S2 />;
    case 'S3':
      return <S3 />;
    case 'S4':
      return <S4 />;
    case 'S5':
      return <S5 />;
    case 'S6':
      return <S6 />;
    default:
      return <S0 />;
  }
}

export default function App() {
  return (
    <SessionProvider>
      <Shell />
    </SessionProvider>
  );
}

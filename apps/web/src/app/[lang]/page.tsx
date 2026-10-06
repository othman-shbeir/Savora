import { redirect } from 'next/navigation';
import { getLocale } from './dictionaries';

// The marketing landing page arrives in Phase 9; until then the root opens the workspace
// (which sends signed-out visitors to sign-in).
export default async function Home() {
  redirect(`/${await getLocale()}/app`);
}

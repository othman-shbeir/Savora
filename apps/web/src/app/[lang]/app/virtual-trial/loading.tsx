import { PageSkeleton } from '@/components/ui/skeleton';
import { getDictionary } from '../../dictionaries';

export default async function Loading() {
  return <PageSkeleton label={(await getDictionary()).shell.loading} shape="cards" />;
}

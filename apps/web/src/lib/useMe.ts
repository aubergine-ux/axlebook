import { useQuery } from '@tanstack/react-query';
import { authStatusQuery } from '../api/auth';

/** The signed-in user (the auth gate guarantees one inside the app shell). */
export function useMe() {
  return useQuery(authStatusQuery).data?.user ?? null;
}

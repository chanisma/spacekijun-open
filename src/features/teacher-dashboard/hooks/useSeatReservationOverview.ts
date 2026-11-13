import { useQuery } from '@tanstack/react-query';
import { readSeatReservationOverviewRows } from '../services/seatReservationReadService';
import { buildSeatReservationOverview, toLocalDateKey } from '../utils/seatReservationOverview';

export function useSeatReservationOverview(enabled: boolean) {
  const date = toLocalDateKey();

  return useQuery({
    queryKey: ['teacher-dashboard', 'seat-reservations', date],
    queryFn: async () => {
      const { reservations, rooms } = await readSeatReservationOverviewRows(date);
      return buildSeatReservationOverview(date, reservations, rooms);
    },
    enabled,
    staleTime: 60 * 1000,
    refetchInterval: enabled ? 60 * 1000 : false,
    refetchOnWindowFocus: true,
  });
}

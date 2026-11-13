import type {
  SeatReservationOverview,
  SeatReservationReadRow,
  SeatRoomOverview,
  StudyRoomReadRow,
} from '../types';

export function toLocalDateKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function summarizeRoom(
  roomId: string,
  roomName: string,
  rows: SeatReservationReadRow[],
): SeatRoomOverview {
  let attended = 0;
  let excused = 0;
  let supplement = 0;
  let pending = 0;

  rows.forEach((row) => {
    if (row.attendance_status === 'supplement') {
      supplement += 1;
    } else if (row.attendance_status === 'excused') {
      excused += 1;
    } else if (row.attendance_status === 'attended' || row.is_attended) {
      attended += 1;
    } else {
      pending += 1;
    }
  });

  const reservations = rows.length;
  const completed = reservations - pending;

  return {
    roomId,
    roomName,
    reservations,
    completed,
    attended,
    excused,
    supplement,
    pending,
    completionRate: reservations > 0 ? Math.round((completed / reservations) * 100) : 0,
  };
}

export function buildSeatReservationOverview(
  date: string,
  reservations: SeatReservationReadRow[],
  rooms: StudyRoomReadRow[],
): SeatReservationOverview {
  const roomNames = new Map(rooms.map((room) => [room.id, room.name]));
  const rowsByRoom = new Map<string, SeatReservationReadRow[]>();

  reservations.forEach((reservation) => {
    const roomRows = rowsByRoom.get(reservation.room_id) ?? [];
    roomRows.push(reservation);
    rowsByRoom.set(reservation.room_id, roomRows);
  });

  const roomSummaries = Array.from(rowsByRoom.entries())
    .map(([roomId, rows]) => summarizeRoom(
      roomId,
      roomNames.get(roomId) ?? '기타 공간',
      rows,
    ))
    .sort((a, b) => b.pending - a.pending || a.roomName.localeCompare(b.roomName, 'ko'));

  const totals = roomSummaries.reduce(
    (result, room) => ({
      reservations: result.reservations + room.reservations,
      completed: result.completed + room.completed,
      attended: result.attended + room.attended,
      excused: result.excused + room.excused,
      supplement: result.supplement + room.supplement,
      pending: result.pending + room.pending,
    }),
    { reservations: 0, completed: 0, attended: 0, excused: 0, supplement: 0, pending: 0 },
  );

  return {
    date,
    ...totals,
    completionRate: totals.reservations > 0
      ? Math.round((totals.completed / totals.reservations) * 100)
      : 0,
    rooms: roomSummaries,
  };
}

export function toLocalDateRangeIso(dateFrom: string, dateTo: string) {
    const start = new Date(`${dateFrom}T00:00:00`);
    const end = new Date(`${dateTo}T23:59:59.999`);
    return {
        dateFrom: start.toISOString(),
        dateTo: end.toISOString()
    };
}

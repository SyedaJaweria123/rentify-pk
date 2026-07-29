import { Pipe, PipeTransform } from '@angular/core';

@Pipe({ name: 'timeAgo', standalone: true, pure: false })
export class TimeAgoPipe implements PipeTransform {
  transform(value: string | Date | null | undefined): string {
    if (!value) return '';
    const diff = Date.now() - new Date(value).getTime();
    const sec  = Math.floor(diff / 1000);
    if (sec < 60)   return 'just now';
    const min = Math.floor(sec / 60);
    if (min < 60)   return `${min}m ago`;
    const hr  = Math.floor(min / 60);
    if (hr < 24)    return `${hr}h ago`;
    const day = Math.floor(hr / 24);
    if (day < 7)    return `${day}d ago`;
    if (day < 30)   return `${Math.floor(day / 7)}w ago`;
    if (day < 365)  return `${Math.floor(day / 30)}mo ago`;
    return `${Math.floor(day / 365)}y ago`;
  }
}

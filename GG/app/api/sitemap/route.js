import { NextResponse } from 'next/server';

export function GET(request) {
  return NextResponse.redirect(new URL('/sitemap.xml', request.url));
}
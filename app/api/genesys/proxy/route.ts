
import { NextRequest, NextResponse } from 'next/server';
import { getGenesysToken } from '../_lib/genesysAuth';

export async function POST(req: NextRequest) {
  return handleRequest(req);
}

export async function GET(req: NextRequest) {
  return handleRequest(req);
}

async function handleRequest(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const path = searchParams.get('path');

  if (!path) {
    return NextResponse.json({ error: 'Missing path parameter' }, { status: 400 });
  }

  try {
    const { token, region } = await getGenesysToken();
    
    // Ensure path has leading slash and join correctly
    const sanitizedPath = path.startsWith('/') ? path : `/${path}`;
    const targetUrl = `https://api.${region}${sanitizedPath}`;
    
    console.log(`[Mawsool Proxy] Forwarding ${req.method} to: ${targetUrl}`);

    const method = req.method;
    let body: string | undefined = undefined;
    
    if (method === 'POST') {
      try {
        body = await req.text();
      } catch (e) {
        body = undefined;
      }
    }

    const response = await fetch(targetUrl, {
      method: method,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: body
    });

    const data = await response.json().catch(() => ({}));
    
    if (!response.ok) {
      console.error(`[Mawsool Proxy] Genesys API returned error ${response.status}:`, data);
      return NextResponse.json(
        { error: data.message || `Genesys Error ${response.status}`, details: data }, 
        { status: response.status }
      );
    }

    return NextResponse.json(data);
  } catch (error: any) {
    console.error(`[Mawsool Proxy Error] Failed to reach Genesys at ${path}:`, error.message);
    return NextResponse.json(
      { error: 'Genesys Bridge Failure', details: error.message },
      { status: 500 }
    );
  }
}

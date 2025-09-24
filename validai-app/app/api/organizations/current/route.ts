import { NextResponse } from 'next/server'
import { getCurrentOrganization } from '@/app/queries/organizations/get-organizations'

export async function GET() {
  try {
    const result = await getCurrentOrganization()
    return NextResponse.json(result)
  } catch (error) {
    console.error('Error fetching current organization:', error)
    return NextResponse.json(
      { error: 'Failed to fetch current organization' },
      { status: 500 }
    )
  }
}
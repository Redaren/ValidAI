import { NextResponse } from 'next/server'
import { getUserOrganizations } from '@/app/queries/organizations/get-organizations'

export async function GET() {
  try {
    const result = await getUserOrganizations()
    return NextResponse.json(result)
  } catch (error) {
    console.error('Error fetching user organizations:', error)
    return NextResponse.json(
      { error: 'Failed to fetch organizations' },
      { status: 500 }
    )
  }
}
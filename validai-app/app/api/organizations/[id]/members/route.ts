import { NextRequest, NextResponse } from 'next/server'
import { getOrganizationMembers } from '@/app/queries/organizations/get-organizations'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    if (!id) {
      return NextResponse.json(
        { error: 'Organization ID is required' },
        { status: 400 }
      )
    }

    const members = await getOrganizationMembers(id)
    return NextResponse.json(members)
  } catch (error) {
    console.error('Error fetching organization members:', error)
    return NextResponse.json(
      { error: 'Failed to fetch organization members' },
      { status: 500 }
    )
  }
}
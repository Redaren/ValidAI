/* THIS FILE WAS GENERATED AUTOMATICALLY BY PAYLOAD. */
import { RootPage, generatePageMetadata } from '@payloadcms/next/views'
import type { Metadata } from 'next'

import configPromise from '@/payload.config'
import { importMap } from '../importMap'

type Args = {
  params: Promise<{
    segments: string[]
  }>
  searchParams: Promise<{
    [key: string]: string | string[]
  }>
}

export const generateMetadata = async ({ params, searchParams }: Args): Promise<Metadata> => {
  return generatePageMetadata({ config: configPromise, params, searchParams })
}

const Page = async ({ params, searchParams }: Args) => {
  return RootPage({ config: configPromise, params, searchParams, importMap })
}

export default Page
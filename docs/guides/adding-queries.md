# Adding Database Queries

This guide shows how to add new database queries following ValidAI's architecture patterns.

## Step-by-Step Process

### 1. Create Query Directory

```bash
mkdir app/queries/[table-name]
```

Example for a `products` table:
```bash
mkdir app/queries/products
```

### 2. Create Query Functions

**File: `app/queries/products/get-products.ts`**

```typescript
import { TypedSupabaseClient } from '@/lib/supabase/types'

// Get all products
export async function getProducts(supabase: TypedSupabaseClient) {
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .order('name')

  if (error) throw error
  return data
}

// Get single product
export async function getProduct(supabase: TypedSupabaseClient, id: string) {
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .eq('id', id)
    .single()

  if (error) throw error
  return data
}

// Get products with filtering
export async function getProductsByCategory(
  supabase: TypedSupabaseClient,
  categoryId: string
) {
  const { data, error } = await supabase
    .from('products')
    .select(`
      *,
      category:categories(name)
    `)
    .eq('category_id', categoryId)
    .order('name')

  if (error) throw error
  return data
}

// Create product
export async function createProduct(
  supabase: TypedSupabaseClient,
  product: TablesInsert<'products'>
) {
  const { data, error } = await supabase
    .from('products')
    .insert(product)
    .select()
    .single()

  if (error) throw error
  return data
}

// Update product
export async function updateProduct(
  supabase: TypedSupabaseClient,
  id: string,
  updates: TablesUpdate<'products'>
) {
  const { data, error } = await supabase
    .from('products')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data
}

// Delete product
export async function deleteProduct(
  supabase: TypedSupabaseClient,
  id: string
) {
  const { error } = await supabase
    .from('products')
    .delete()
    .eq('id', id)

  if (error) throw error
}
```

### 3. Create React Hooks

**File: `app/queries/products/use-products.ts`**

```typescript
'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createTypedBrowserClient } from '@/lib/supabase/typed-clients'
import {
  getProducts,
  getProduct,
  getProductsByCategory,
  createProduct,
  updateProduct,
  deleteProduct,
} from './get-products'

// Query hooks
export function useProducts() {
  const supabase = createTypedBrowserClient()

  return useQuery({
    queryKey: ['products'],
    queryFn: () => getProducts(supabase),
  })
}

export function useProduct(id: string) {
  const supabase = createTypedBrowserClient()

  return useQuery({
    queryKey: ['products', id],
    queryFn: () => getProduct(supabase, id),
    enabled: !!id,
  })
}

export function useProductsByCategory(categoryId: string) {
  const supabase = createTypedBrowserClient()

  return useQuery({
    queryKey: ['products', 'category', categoryId],
    queryFn: () => getProductsByCategory(supabase, categoryId),
    enabled: !!categoryId,
  })
}

// Mutation hooks
export function useCreateProduct() {
  const queryClient = useQueryClient()
  const supabase = createTypedBrowserClient()

  return useMutation({
    mutationFn: (product: TablesInsert<'products'>) =>
      createProduct(supabase, product),
    onSuccess: () => {
      queryClient.invalidateQueries(['products'])
    },
  })
}

export function useUpdateProduct() {
  const queryClient = useQueryClient()
  const supabase = createTypedBrowserClient()

  return useMutation({
    mutationFn: ({ id, updates }: {
      id: string
      updates: TablesUpdate<'products'>
    }) => updateProduct(supabase, id, updates),
    onSuccess: (data) => {
      queryClient.invalidateQueries(['products'])
      queryClient.invalidateQueries(['products', data.id])
    },
  })
}

export function useDeleteProduct() {
  const queryClient = useQueryClient()
  const supabase = createTypedBrowserClient()

  return useMutation({
    mutationFn: (id: string) => deleteProduct(supabase, id),
    onSuccess: () => {
      queryClient.invalidateQueries(['products'])
    },
  })
}
```

### 4. Server-Side Prefetching

**File: `app/products/page.tsx`**

```typescript
import { HydrationBoundary, dehydrate } from '@tanstack/react-query'
import { createTypedServerClient } from '@/lib/supabase/typed-clients'
import { getProducts } from '@/app/queries/products/get-products'
import { createQueryClient } from '@/lib/query-client'
import { ProductsClient } from './products-client'

export default async function ProductsPage() {
  const queryClient = createQueryClient()
  const supabase = await createTypedServerClient()

  // Prefetch products data
  await queryClient.prefetchQuery({
    queryKey: ['products'],
    queryFn: () => getProducts(supabase),
  })

  return (
    <div className="container mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">Products</h1>
      <HydrationBoundary state={dehydrate(queryClient)}>
        <ProductsClient />
      </HydrationBoundary>
    </div>
  )
}
```

### 5. Client Component

**File: `app/products/products-client.tsx`**

```typescript
'use client'

import { useProducts, useCreateProduct } from '@/app/queries/products/use-products'
import { useNotificationStore } from '@/stores'
import { useState } from 'react'

export function ProductsClient() {
  const { data: products, isLoading, error } = useProducts()
  const createProduct = useCreateProduct()
  const addNotification = useNotificationStore((state) => state.addNotification)
  const [newProductName, setNewProductName] = useState('')

  const handleCreate = async () => {
    try {
      await createProduct.mutateAsync({
        name: newProductName,
        price: 0,
      })
      setNewProductName('')
      addNotification({
        type: 'success',
        title: 'Product created',
        duration: 3000,
      })
    } catch (error) {
      addNotification({
        type: 'error',
        title: 'Failed to create product',
        message: error.message,
      })
    }
  }

  if (isLoading) return <div>Loading products...</div>

  if (error) {
    addNotification({
      type: 'error',
      title: 'Failed to load products',
      message: error.message,
    })
    return <div>Error loading products</div>
  }

  return (
    <div>
      <div className="mb-6">
        <input
          type="text"
          value={newProductName}
          onChange={(e) => setNewProductName(e.target.value)}
          placeholder="Product name"
          className="border rounded px-3 py-2 mr-2"
        />
        <button
          onClick={handleCreate}
          disabled={!newProductName || createProduct.isPending}
          className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 disabled:opacity-50"
        >
          {createProduct.isPending ? 'Creating...' : 'Create Product'}
        </button>
      </div>

      <div className="space-y-4">
        {products?.map((product) => (
          <div key={product.id} className="p-4 border rounded-lg">
            <h3 className="font-semibold">{product.name}</h3>
            <p className="text-gray-600">${product.price}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
```

## Query Key Patterns

Use consistent patterns for query keys:

```typescript
// Base queries
['products']                    // All products
['products', id]               // Single product
['products', 'category', catId] // Products by category

// With filters
['products', { status: 'active' }]
['products', { search: 'query' }]

// Related data
['products', id, 'reviews']
['products', id, 'variants']
```

## Error Handling

Always handle errors gracefully:

```typescript
const { data, error, isLoading } = useProducts()

if (error) {
  // Show user-friendly error
  addNotification({
    type: 'error',
    title: 'Unable to load products',
    message: 'Please try again or contact support if the problem persists.',
  })
}
```

## Performance Tips

### 1. Use Optimistic Updates

```typescript
const updateProduct = useMutation({
  mutationFn: ({ id, updates }) => updateProductAPI(id, updates),
  onMutate: async ({ id, updates }) => {
    await queryClient.cancelQueries(['products', id])

    const previousProduct = queryClient.getQueryData(['products', id])
    queryClient.setQueryData(['products', id], {
      ...previousProduct,
      ...updates,
    })

    return { previousProduct }
  },
  onError: (err, { id }, context) => {
    queryClient.setQueryData(['products', id], context.previousProduct)
  },
  onSettled: ({ id }) => {
    queryClient.invalidateQueries(['products', id])
  },
})
```

### 2. Background Updates

```typescript
useQuery({
  queryKey: ['products'],
  queryFn: () => getProducts(supabase),
  staleTime: 5 * 60 * 1000, // 5 minutes
  refetchInterval: 10 * 60 * 1000, // Refetch every 10 minutes
})
```

### 3. Selective Invalidation

```typescript
// Instead of invalidating all products
queryClient.invalidateQueries(['products'])

// Be more specific
queryClient.invalidateQueries(['products', 'category', categoryId])
```

## Best Practices

### ✅ DO
- Always use `TypedSupabaseClient` for type safety
- Throw errors in query functions (let TanStack Query handle them)
- Use consistent query key patterns
- Implement proper loading and error states
- Invalidate relevant queries after mutations
- Use optimistic updates for better UX

### ❌ DON'T
- Call Supabase directly in components
- Store server data in Zustand
- Forget to handle loading/error states
- Use overly complex query keys
- Forget to enable/disable queries based on dependencies
# Adding Database Queries

This guide shows how to add new database queries using Supabase's PostgREST, database functions, and Edge Functions following ValidAI's architecture patterns.

## Architecture Decision Tree

Choose the right approach based on your needs:

1. **Simple CRUD operations** → Direct PostgREST table queries
2. **Complex multi-table queries** → Database functions (RPC)
3. **Operations requiring elevated permissions** → Edge Functions
4. **Real-time data** → PostgREST + Subscriptions

## Step-by-Step Process

### 1. Create Query Directory

```bash
mkdir app/queries/[table-name]
```

Example for a `products` table:
```bash
mkdir app/queries/products
```

### 2A. Direct PostgREST Queries (Simple Operations)

**File: `app/queries/products/use-products.ts`**

```typescript
'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

// Direct table queries - no separate get-* files needed
export function useProducts() {
  const supabase = createClient()

  return useQuery({
    queryKey: ['products'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .order('name')

      if (error) throw error
      return data
    },
  })
}

export function useProduct(id: string) {
  const supabase = createClient()

  return useQuery({
    queryKey: ['products', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('id', id)
        .single()

      if (error) throw error
      return data
    },
    enabled: !!id,
  })
}

export function useProductsByCategory(categoryId: string) {
  const supabase = createClient()

  return useQuery({
    queryKey: ['products', 'category', categoryId],
    queryFn: async () => {
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
    },
    enabled: !!categoryId,
  })
}
```

### 2B. Database Functions (Complex Operations)

For complex queries involving business logic or multiple tables, create database functions:

**Database Migration:**

```sql
-- Create function for complex product analytics
CREATE OR REPLACE FUNCTION get_product_analytics(category_filter TEXT DEFAULT NULL)
RETURNS TABLE(
  product_id uuid,
  product_name text,
  category_name text,
  total_orders bigint,
  revenue numeric,
  avg_rating numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id,
    p.name,
    c.name,
    COUNT(oi.id) as total_orders,
    SUM(oi.price * oi.quantity) as revenue,
    AVG(r.rating) as avg_rating
  FROM products p
  LEFT JOIN categories c ON c.id = p.category_id
  LEFT JOIN order_items oi ON oi.product_id = p.id
  LEFT JOIN reviews r ON r.product_id = p.id
  WHERE (category_filter IS NULL OR c.name = category_filter)
  GROUP BY p.id, p.name, c.name
  ORDER BY revenue DESC NULLS LAST;
END;
$$;

GRANT EXECUTE ON FUNCTION get_product_analytics(TEXT) TO authenticated;
```

**React Hook:**

```typescript
export function useProductAnalytics(categoryFilter?: string) {
  const supabase = createClient()

  return useQuery({
    queryKey: ['product-analytics', categoryFilter],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_product_analytics', {
        category_filter: categoryFilter || null
      })

      if (error) throw error
      return data
    },
    staleTime: 10 * 60 * 1000, // 10 minutes - analytics data can be stale
  })
}
```

### 2C. Edge Functions (Service-Role Operations)

For operations requiring elevated permissions or external API calls:

**Edge Function: `supabase/functions/bulk-import-products/index.ts`**

```typescript
import { createClient } from 'jsr:@supabase/supabase-js@2'

Deno.serve(async (req) => {
  try {
    const { products } = await req.json()

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Verify user permissions first
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    )

    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        {
          status: 401,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'authorization, content-type'
          }
        }
      )
    }

    // Use admin client for bulk operations
    const { data, error } = await supabaseAdmin
      .from('products')
      .insert(products)
      .select()

    if (error) throw error

    return new Response(
      JSON.stringify({ success: true, products: data }),
      {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'authorization, content-type'
        }
      }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'authorization, content-type'
        }
      }
    )
  }
})
```

**React Hook:**

```typescript
export function useBulkImportProducts() {
  const queryClient = useQueryClient()
  const supabase = createClient()

  return useMutation({
    mutationFn: async (products: Array<{ name: string; price: number }>) => {
      const { data, error } = await supabase.functions.invoke('bulk-import-products', {
        body: { products },
      })

      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] })
    },
  })
}
```

### 3. Mutation Hooks (CRUD Operations)

Add mutation hooks for create, update, delete operations:

```typescript
// Simple mutations using direct PostgREST
export function useCreateProduct() {
  const queryClient = useQueryClient()
  const supabase = createClient()

  return useMutation({
    mutationFn: async (product: { name: string; price: number; category_id: string }) => {
      const { data, error } = await supabase
        .from('products')
        .insert(product)
        .select()
        .single()

      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] })
    },
  })
}

export function useUpdateProduct() {
  const queryClient = useQueryClient()
  const supabase = createClient()

  return useMutation({
    mutationFn: async ({ id, updates }: {
      id: string
      updates: { name?: string; price?: number; category_id?: string }
    }) => {
      const { data, error } = await supabase
        .from('products')
        .update(updates)
        .eq('id', id)
        .select()
        .single()

      if (error) throw error
      return data
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['products'] })
      queryClient.invalidateQueries({ queryKey: ['products', data.id] })
    },
  })
}

export function useDeleteProduct() {
  const queryClient = useQueryClient()
  const supabase = createClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('products')
        .delete()
        .eq('id', id)

      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] })
    },
  })
}

// Complex mutation using database function
export function useCreateProductWithInventory() {
  const queryClient = useQueryClient()
  const supabase = createClient()

  return useMutation({
    mutationFn: async (data: {
      name: string
      price: number
      category_id: string
      initial_stock: number
    }) => {
      const { data: result, error } = await supabase.rpc(
        'create_product_with_inventory',
        {
          product_name: data.name,
          product_price: data.price,
          product_category: data.category_id,
          initial_stock: data.initial_stock
        }
      )

      if (error) throw error
      return result
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] })
      queryClient.invalidateQueries({ queryKey: ['inventory'] })
    },
  })
}
```

### 4. Server-Side Prefetching with PostgREST

**File: `app/products/page.tsx`**

```typescript
import { HydrationBoundary, dehydrate } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/server'
import { createQueryClient } from '@/lib/query-client'
import { ProductsClient } from './products-client'

export default async function ProductsPage() {
  const queryClient = createQueryClient()
  const supabase = await createClient()

  // Prefetch products using direct PostgREST
  await queryClient.prefetchQuery({
    queryKey: ['products'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .order('name')

      if (error) throw error
      return data
    },
  })

  // Prefetch analytics using database function
  await queryClient.prefetchQuery({
    queryKey: ['product-analytics'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_product_analytics')
      if (error) throw error
      return data
    },
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

## Real-time Subscriptions

Add real-time updates for live data:

```typescript
import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

export function useProductSubscription() {
  const queryClient = useQueryClient()
  const supabase = createClient()

  useEffect(() => {
    const channel = supabase
      .channel('products')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'products',
        },
        (payload) => {
          console.log('Product change:', payload)

          // Invalidate relevant queries
          queryClient.invalidateQueries({ queryKey: ['products'] })

          if (payload.eventType === 'UPDATE' && payload.new?.id) {
            queryClient.invalidateQueries({ queryKey: ['products', payload.new.id] })
          }
        }
      )
      .subscribe()

    return () => {
      channel.unsubscribe()
    }
  }, [queryClient, supabase])
}
```

## Query Key Patterns

Use consistent patterns for query keys:

```typescript
// Base queries
['products']                    // All products (PostgREST)
['products', id]               // Single product (PostgREST)
['products', 'category', catId] // Products by category (PostgREST)
['product-analytics', filter]   // Analytics (Database Function)

// With filters
['products', { status: 'active' }]
['products', { search: 'query' }]

// Related data
['products', id, 'reviews']
['products', id, 'variants']

// Database functions
['user-organizations']          // RPC: get_user_organizations()
['current-organization']       // RPC: get_current_organization()
['product-analytics']          // RPC: get_product_analytics()
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

### 3. Selective Invalidation with PostgREST

```typescript
// Instead of invalidating all products
queryClient.invalidateQueries({ queryKey: ['products'] })

// Be more specific
queryClient.invalidateQueries({ queryKey: ['products', 'category', categoryId] })

// Invalidate database function results
queryClient.invalidateQueries({ queryKey: ['product-analytics'] })

// Invalidate after Edge Function operations
queryClient.invalidateQueries({ queryKey: ['user-organizations'] })
queryClient.invalidateQueries({ queryKey: ['current-organization'] })
```

## Best Practices

### ✅ DO
- Use PostgREST directly for simple CRUD operations
- Create database functions for complex multi-table queries
- Use Edge Functions only for service-role operations
- Return TABLE format from database functions (not JSON)
- Include CORS headers in Edge Functions
- Use consistent query key patterns
- Implement real-time subscriptions for live data
- Implement proper loading and error states
- Invalidate relevant queries after mutations
- Use optimistic updates for better UX

### ❌ DON'T
- Create API routes for simple database operations
- Call Supabase directly in components (use hooks)
- Store server data in Zustand (use TanStack Query)
- Use Edge Functions for operations that can be done with RLS
- Return JSON from database functions (use TABLE)
- Forget to handle loading/error states
- Forget to refresh JWT after Edge Function calls
- Use overly complex query keys

### Architecture Decision Guide

**Use Direct PostgREST when:**
- Simple CRUD operations on single table
- Standard filtering, sorting, pagination
- Operations that can be secured with RLS

**Use Database Functions when:**
- Complex queries involving multiple tables
- Business logic that should run on the database
- Atomic operations (create organization + membership)
- Performance-critical queries that benefit from SQL optimization

**Use Edge Functions when:**
- Operations requiring service-role permissions
- JWT metadata updates
- Email sending or external API calls
- File processing or transformations
- Operations that bypass RLS (with careful validation)
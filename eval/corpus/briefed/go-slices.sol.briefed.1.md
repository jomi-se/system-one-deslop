# Go slices: what gets copied, what gets shared

You make a copy of a slice, change the copy, and discover that the original changed too:

```go
original := []int{10, 20, 30}
other := original
other[0] = 99

fmt.Println(original) // [99 20 30]
```

The assignment copied something, just not the integers.

Internally, a slice is a small descriptor containing a pointer into a backing array, a length, and a capacity. Assigning `original` to `other` copies those three fields. Both pointers still refer to the same storage, so writing through either slice changes the same array element. Go’s [slice internals article](https://go.dev/blog/slices-intro) describes this representation.

Length determines which elements you can index. Capacity determines how far you can extend the slice without replacing its backing array. Neither field says that the slice owns the storage exclusively.

Taking a subslice shares storage too:

```go
middle := original[1:2]
fmt.Println(len(middle), cap(middle)) // 1 2
```

Its pointer starts at the element containing `20`. Its capacity includes that element and the remaining slot after it. Changing `middle[0]` therefore changes `original[1]`, even though the slices have different lengths and starting positions.

## Why a helper changes elements but cannot shorten your slice

Suppose a helper updates the first element, then removes it:

```go
func consume(s []int) {
    s[0] = 99
    s = s[1:]
}

values := []int{10, 20, 30}
consume(values)
fmt.Println(values) // [99 20 30]
```

The element update reaches the caller. The shortening does not.

Function arguments are passed by value, including slice descriptors. Inside `consume`, `s` initially points to the caller’s array. Assigning to `s[0]` writes into that array; assigning to `s` changes the helper’s local descriptor. The caller’s pointer and length stay as they were. The Go blog’s [discussion of slice arguments](https://go.dev/blog/slices) works through this distinction.

A helper that changes the visible sequence should usually return the resulting slice:

```go
func consume(s []int) []int {
    s[0] = 99
    return s[1:]
}

values = consume(values)
```

The same convention applies to helpers that append. Returning the slice lets the caller receive its updated length and, if allocation occurred, its new backing-array pointer.

## When `append` overwrites another slice

This looks like building a new sequence from a prefix:

```go
all := []int{10, 20, 30, 40}
prefix := all[:2]
extended := append(prefix, 99)

fmt.Println(extended) // [10 20 99]
fmt.Println(all)      // [10 20 99 40]
```

But `prefix` has length two and capacity four. There is room for another element, so `append` writes into the existing array at index two. That slot was already visible through `all`.

When there is insufficient capacity, `append` allocates another backing array and copies the existing elements into it. Subsequent element writes through the returned slice then use the new storage. This is why an aliasing bug can disappear after an innocent change to preallocation: the append may take a different allocation path.

You can restrict a subslice’s capacity using a three-index slice expression:

```go
prefix := all[:2:2]
extended := append(prefix, 99)
```

Here, `prefix` has both length and capacity two. Appending one element requires another array, protecting the suffix of `all`. These capacity and allocation behaviors are defined in the [language specification](https://go.dev/ref/spec#Full_slice_expressions).

The existing elements are still shared until that append happens. Writing `prefix[0] = 99` still changes `all[0]`. If the recipient needs an independent copy immediately, allocate and copy the elements instead.

Capacity growth is also something to avoid baking into program logic. You may observe doubling for some sizes, but the [runtime’s growth calculation](https://go.dev/src/runtime/slice.go) varies with size and allocation details. Code should depend on having enough capacity, rather than a particular capacity after growth.

## Reserving space accidentally creates elements

A loop meant to collect three results produces six:

```go
results := make([]int, 3)
for _, n := range []int{7, 8, 9} {
    results = append(results, n)
}

fmt.Println(results) // [0 0 0 7 8 9]
```

The second argument to `make` sets the length. Those first three zero-valued elements already exist; appending starts after them.

For an initially empty collection with reserved storage, use:

```go
results := make([]int, 0, 3)
```

Now the length is zero and the capacity is three. Appends fill the reserved slots. Directly assigning `results[0]`, however, would panic because indexing is checked against length.

When filling known positions, `make([]int, 3)` is appropriate. When collecting results through append, starting with length zero avoids introducing unwanted entries.

## Why a tiny slice keeps a large allocation alive

A parser reads a large file and retains only a short identifier:

```go
func identifier(data []byte) []byte {
    return data[100:120]
}
```

The returned slice contains twenty visible bytes, but its pointer still refers into the original allocation. Keeping it reachable can keep the whole backing array alive. Restricting its capacity to twenty does not free the rest; that changes the descriptor without moving the bytes.

Copy the retained portion when it needs a separate lifetime:

```go
part := data[100:120]
saved := make([]byte, len(part))
copy(saved, part)
```

Once other references disappear, the original allocation can be collected. This costs a small allocation and copy, which is often preferable to retaining a large input buffer.

Slices containing pointers have another retention trap. Shortening a queue can leave discarded pointers in its backing array. When removing the last entry, clear its slot before shortening:

```go
last := len(queue) - 1 // queue must be nonempty
queue[last] = nil
queue = queue[:last]
```

The Go blog explains this garbage-collection issue in [its discussion of slice deletion](https://go.dev/blog/generic-slice-functions). Clearing removes the reference stored in that slot; collection still depends on whether anything else references the object.

Finally, copying a slice of pointers copies the pointers, not the objects they reference. The backing arrays become independent, but mutations to a pointed-to object remain visible through both copies. When deciding whether a copy is sufficient, check what the elements themselves contain as well as which slice holds them.

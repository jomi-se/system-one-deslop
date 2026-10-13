# Go slices: what gets copied, what gets shared

Consider a “copy” that changes the original:

```go
a := []int{10, 20, 30}
b := a
b[0] = 99

fmt.Println(a) // [99 20 30]
```

The assignment copied something. It just didn’t copy the integers.

A slice holds a small descriptor, usually called its header: a pointer into an underlying array, a length, and a capacity. Assigning `a` to `b` copies those three fields. Both pointers still lead to the same storage, so writing through either slice changes elements visible through the other. Go’s [explanation of slice internals](https://go.dev/blog/slices) describes this distinction in detail.

Reslicing changes the descriptor too. With `c := a[1:3]`, the pointer moves to the element containing `20`, and the length becomes two. No elements move. Assigning `c[0] = 7` would therefore change `a[1]`, even though the two expressions use different indices.

## Reserving space without adding elements

Suppose you expect three results and write:

```go
results := make([]int, 3)
results = append(results, 42)

fmt.Println(results) // [0 0 0 42]
```

Those zeros aren’t padding that `append` will fill. They are already elements of the slice. The second argument to `make` specifies length, and those elements start at their zero value.

To reserve room while starting empty, use:

```go
results := make([]int, 0, 3)
results = append(results, 42)

fmt.Println(results) // [42]
```

Here the length is zero and the capacity is three. Length determines which elements you can index; capacity measures how far the slice can extend from its starting position without needing another array. Consequently, `results[1]` still panics, although there is storage available for it. You could expose that storage by reslicing to `results[:3]`. [Effective Go](https://go.dev/doc/effective_go#allocation_make) explains how `make` initializes these fields.

If you don’t know the eventual size, `var results []int` works too. This is a nil slice, with zero length and capacity, and you can append to it normally. A non-nil empty slice also has zero length, so check `len(results) == 0` when your question is whether there are any elements.

## When `append` overwrites another slice

This code produces two results that look unexpectedly alike:

```go
base := make([]int, 1, 3)
base[0] = 10

left := append(base, 20)
right := append(base, 30)

fmt.Println(left)  // [10 30]
fmt.Println(right) // [10 30]
```

Both calls start from `base`, whose length remains one. Both therefore write the new element at index one of the same array. The second call replaces the `20` that `left` can see.

When capacity is sufficient, `append` reuses the underlying array. When it isn’t, `append` allocates another array and copies the existing elements before adding the new ones. That behavior is specified by the [language specification](https://go.dev/ref/spec#Appending_to_and_copying_slices).

Changing the initial capacity to one makes this example behave differently: each append needs separate storage. That’s why aliasing bugs sometimes appear after an innocent preallocation change. The larger capacity didn’t corrupt anything; it allowed writes to share storage that previously had to be copied.

The returned slice contains the updated length and possibly a different pointer, which is why you normally write `s = append(s, value)`. The exact capacity chosen during growth is an implementation detail; don’t make program behavior depend on it doubling.

## A function can change elements without changing length

Imagine a helper that updates the first element and adds another:

```go
func update(s []int) {
    s[0] = 9
    s = append(s, 8)
}

s := make([]int, 1, 2)
update(s)

fmt.Println(s) // [9]
```

The caller sees the element change but still has a slice of length one. Function arguments are passed by value, so `update` receives its own header. Its pointer initially refers to the caller’s array, but changing its length doesn’t change the caller’s length. The appended `8` is present in the shared array here, just outside the caller’s visible slice.

Return the resulting slice when the caller needs that new length:

```go
func update(s []int) []int {
    s[0] = 9
    return append(s, 8)
}

s = update(s)
```

This is the same reasoning behind `append` returning a slice, as Go’s [slice mechanics article](https://go.dev/blog/slices) explains.

## Keeping an append inside its own boundary

Suppose you pass the first two elements of a buffer to code that may append:

```go
buffer := []int{1, 2, 3, 4}
prefix := buffer[:2:2]
extended := append(prefix, 9)

fmt.Println(buffer)   // [1 2 3 4]
fmt.Println(extended) // [1 2 9]
```

The third index limits capacity. In `buffer[:2:2]`, both length and capacity are two, forcing this append to allocate separate storage. The [full slice expression](https://go.dev/ref/spec#Full_slice_expressions) gives you this control without copying the existing elements.

It doesn’t prevent every shared write. Before the append, `prefix[0] = 99` would still change `buffer[0]`. Use a copy when the recipient needs independent elements as well as independent growth.

## A tiny slice can retain a large allocation

A parser might read a large file, extract a short field, and cache it:

```go
field := data[start:end]
cache[key] = field
```

Even if `field` contains only twelve bytes, its pointer can keep the entire underlying allocation alive. Reducing its capacity won’t release the rest of the array. This retention problem is covered in the [Go slices introduction](https://go.dev/blog/slices-intro).

For a field that must outlive the input buffer, copy it:

```go
field := slices.Clone(data[start:end])
cache[key] = field
```

The small copy lets the original allocation become collectible once nothing else references it. It also protects the cached bytes if the parser later reuses its input buffer.

Be aware that [`slices.Clone`](https://pkg.go.dev/slices#Clone) copies elements by assignment. For `[]byte`, that gives you independent bytes. For `[][]byte`, it copies the inner slice headers, so their arrays remain shared. When deciding where to copy, follow the data your code will actually modify or retain; another layer of slices may require another layer of copying.

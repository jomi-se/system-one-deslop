# How Go Slices Really Work (and Why They Sometimes Surprise You)

Slices are everywhere in Go. They look like dynamic arrays and usually act like them. Every so often, though, one behaves in a way that makes you stare at your screen. The surprises stop once you know what a slice is underneath. This post walks through backing arrays, length, capacity, and `append`, then covers the gotchas that follow from them.

## A Slice Is a Small Struct

A slice does not hold any elements. It is a small descriptor, often called the *slice header*, with three fields:

```go
type slice struct {
    ptr *T  // pointer to the first element in a backing array
    len int // number of elements you can access
    cap int // number of elements available from ptr to the end of the array
}
```

The elements live in a separate **backing array**. The slice is a window onto part of that array. When you pass a slice to a function, assign it to another variable, or return it, Go copies these three fields. It never copies the elements.

That one fact explains nearly everything else in this post.

## Length vs. Capacity

- **Length** (`len(s)`) is how many elements the slice currently exposes. Indexing past it panics.
- **Capacity** (`cap(s)`) is how many elements exist in the backing array, counting from the slice's starting point to the array's end.

```go
s := make([]int, 3, 10)
fmt.Println(len(s), cap(s)) // 3 10
```

Here the backing array has room for 10 ints. The slice exposes only the first 3. The other 7 slots are allocated but out of reach until the slice grows.

## Slicing Shares Memory

The expression `s[low:high]` creates a new header that points into the **same** backing array:

```go
s := []int{1, 2, 3, 4, 5}
t := s[1:3]

fmt.Println(t, len(t), cap(t)) // [2 3] 2 4
t[0] = 99
fmt.Println(s) // [1 99 3 4 5]
```

`t` begins at index 1 of the array. Its length is `3 - 1 = 2`. Its capacity runs to the end of the array, so it is `5 - 1 = 4`. Writing through `t` changes the memory that `s` sees, because both slices point at the same array.

## How `append` Works

`append(s, x)` does one of two things:

1. **If `len(s) < cap(s)`**, it writes `x` into the next slot of the existing backing array and returns a header with `len + 1`. Nothing is allocated.
2. **If `len(s) == cap(s)`**, it allocates a new, larger array, copies the elements over, writes `x`, and returns a header pointing to the new array.

That is why you must always use the result:

```go
s = append(s, x)
```

The returned header may point to a different array, and its length is always different from the old one.

The runtime chooses the new size. For small slices it roughly doubles capacity. Past a threshold (256 elements in current Go versions) growth tapers smoothly toward about 1.25x. The result is then rounded up to fit the allocator's size classes. Don't rely on exact numbers. Rely on the fact that growth is amortized, so appending in a loop costs O(1) per element on average.

## Gotcha #1: `append` Can Overwrite Someone Else's Data

Go back to the earlier example. `t` has length 2 and capacity 4, so it has spare room:

```go
s := []int{1, 2, 3, 4, 5}
t := s[1:3]          // [2 3], cap 4
t = append(t, 100)
fmt.Println(s)       // [1 2 3 100 5]
```

The `append` did not allocate. It wrote into the slot that still belongs to `s[3]`. If another part of your program holds `s`, its data just changed.

Here is a subtler version:

```go
a := make([]int, 3, 10)
b := append(a, 4)
c := append(a, 5)
fmt.Println(b[3], c[3]) // 5 5
```

Both `append` calls wrote to the same slot, so `b` and `c` alias each other. Code like this works or breaks depending on whether there happened to be spare capacity, which makes the bugs intermittent.

**The fix:** use a full slice expression, `s[low:high:max]`, to cap the capacity. Any later `append` is then forced to allocate:

```go
t := s[1:3:3] // len 2, cap 2
t = append(t, 100) // new array; s is untouched
```

When you need full independence, copy explicitly with `slices.Clone(s)`, or `append([]int(nil), s...)` on older Go versions.

## Gotcha #2: Appending Inside a Function

Since the header is passed by value, a function that appends to its parameter does not change the caller's length:

```go
func add(s []int) {
    s = append(s, 42)
}

s := make([]int, 0, 10)
add(s)
fmt.Println(len(s)) // 0
```

The function did write 42 into the shared backing array. The caller's header still says `len == 0`, so the caller never sees it. Return the new slice (`s = add(s)`) or pass a pointer to the slice.

## Gotcha #3: Small Slices Can Pin Large Arrays

A subslice keeps its whole backing array alive. That array cannot be garbage collected while any slice points into it.

```go
func firstLine(data []byte) []byte {
    i := bytes.IndexByte(data, '\n')
    return data[:i] // holds onto all of data
}
```

If `data` is a 100 MB file, returning a 40-byte line keeps all 100 MB in memory. Copy the part you need instead:

```go
return bytes.Clone(data[:i])
```

## Gotcha #4: `range` Gives You Copies

The loop variable in `for _, v := range s` is a copy of each element. Changing it does nothing to the slice:

```go
for _, v := range users {
    v.Active = true // modifies the copy only
}
```

Write through the index instead:

```go
for i := range users {
    users[i].Active = true
}
```

## Gotcha #5: nil vs. Empty

`var s []int` is a nil slice. `s := []int{}` is an empty, non-nil slice. Both have length 0, both work with `append`, and both work with `range`. They still differ in places: `s == nil` returns different results, and `encoding/json` marshals a nil slice as `null` but an empty slice as `[]`. If an API contract requires `[]`, initialize the slice explicitly.

## The Mental Model

Whenever a slice surprises you, ask three questions:

1. **Which backing array does this header point to?**
2. **What are its `len` and `cap` right now?**
3. **Will this `append` fit in the existing capacity, or will it reallocate?**

A slice is a pointer, a length, and a capacity. Once you picture that header and the array behind it, slices become predictable. You'll also know when to reach for `copy`, `slices.Clone`, or a three-index slice to keep shared memory from causing bugs.

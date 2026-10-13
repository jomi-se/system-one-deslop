# Go slices: small headers, shared storage, occasional shenanigans

Slices are pleasantly boring until two of them share an array and someone calls `append`. Then your perfectly reasonable code starts changing data somewhere else.

The good news: there’s a small mental model that explains almost everything. A slice describes a window into an array. It doesn’t own that array, and copying the slice doesn’t copy its elements.

## The three things in a slice

Think of a slice as this header:

```go
type sliceHeader struct {
    data *Element
    len  int
    cap  int
}
```

That’s a conceptual sketch, not a type you should build yourself with `unsafe`.

The pointer identifies the first element of the slice’s window. Length is how many elements you can access. Capacity is how many elements fit from that starting point to the end of the available backing storage.

```go
s := make([]int, 3, 5)
```

This gives us:

```text
backing array: [0 0 0 0 0]
               └─────┘       len = 3
               └─────────┘   cap = 5
```

`s[2]` is valid. `s[3]` panics, even though storage exists there. Indexing checks length, not capacity.

You can expose that storage by reslicing:

```go
s = s[:5]
s[3] = 42
```

Reslicing changes the header, not the array. You can extend a slice up to its capacity, but you can’t reslice backward before its starting point.

## Assignment shares the array

Passing a slice to a function or assigning it to another variable copies the header:

```go
a := []int{10, 20, 30}
b := a

b[0] = 99
fmt.Println(a) // [99 20 30]
```

Both headers point into the same backing array. Their lengths and capacities are separate values, though:

```go
b = b[:1]

fmt.Println(len(a)) // 3
fmt.Println(len(b)) // 1
```

This explains a common function surprise: changing elements inside a function affects the caller’s array, but changing the function’s local slice length doesn’t update the caller’s header.

If a function grows a slice, return the updated slice.

## `append` has two possible paths

`append` returns a new slice header. What happens underneath depends on capacity.

If there’s enough room, it writes into the existing backing array:

```go
s := make([]int, 1, 3)
s[0] = 10
s = append(s, 20)
```

Same array, longer window.

If there isn’t enough room, it allocates a larger backing array, copies the existing elements, and adds the new ones:

```go
s := []int{10}
s = append(s, 20)
```

Other slices pointing at the old array still point there. They don’t follow `s` to its new home.

That’s why this assignment matters:

```go
s = append(s, value)
```

The returned header contains the updated length and potentially a new pointer.

Don’t depend on an exact capacity growth formula. Growth is an implementation detail; correctness should work whether the next allocation is modest or generous.

## The sneaky one: appending can overwrite another slice

Here’s the classic trap:

```go
all := []int{10, 20, 30, 40}
prefix := all[:2]

prefix = append(prefix, 99)

fmt.Println(all) // [10 20 99 40]
```

`prefix` has length two, but capacity four. Appending writes into the next available array slot, which happens to be `all[2]`.

Nothing mystical happened. We had two windows into the same storage, and one window expanded.

This gets especially spicy when functions return subslices. A caller may reasonably append to the result without realizing it can overwrite another part of the original data.

## Put a fence around capacity

A full slice expression lets you limit capacity:

```go
prefix := all[:2:2]
```

The third index sets the capacity boundary. Here, both length and capacity are two.

Now appending an element requires a new array:

```go
prefix = append(prefix, 99)
// all remains unchanged
```

This is useful when handing a slice to code that may append.

It isn’t complete isolation, though:

```go
prefix[0] = 77 // still changes all[0]
```

The capacity fence prevents append from using the remaining array space. Existing elements remain shared.

## Copy when you need independent storage

For an independent backing array, allocate and copy:

```go
clone := make([]int, len(original))
copy(clone, original)
```

Now changes to `clone`’s elements won’t affect `original`.

But the copy is shallow. With `[]*Job`, you get independent slots containing pointers to the same jobs. With `[][]byte`, the inner slices still share their backing arrays. Independence only goes as deep as the values you actually copy.

Also, `copy` copies at most the smaller of the source and destination lengths. Spare destination capacity doesn’t count:

```go
dst := make([]int, 0, 100)
n := copy(dst, original) // 0
```

Give the destination enough length first.

## Tiny slices can retain big allocations

Suppose you read a large file and keep one small section:

```go
header := fileBytes[:32]
```

That little slice can keep the entire backing allocation alive. The garbage collector can’t free the array while a slice still references it.

If the small result needs to outlive the large buffer, copy it.

A related issue appears in slices holding pointers. Shortening a slice doesn’t erase references in the discarded slots. Those references can keep objects alive while the backing array remains reachable.

Clear discarded elements when that matters:

```go
clear(jobs[newLen:])
jobs = jobs[:newLen]
```

Remember that clearing also affects any aliases viewing those slots.

## Two final footguns

A nil slice and an allocated empty slice both have length zero, and both support `append`. They can still behave differently at API boundaries: Go’s `encoding/json` normally encodes them as `null` and `[]`, respectively.

And sharing an array doesn’t provide synchronization. Concurrent access to overlapping elements, with at least one writer, needs coordination. Spare capacity can make concurrent appends overlap too.

When slice code gets weird, draw the headers and the array. Mark each slice’s starting point, length, and capacity. Usually, the bug becomes embarrassingly obvious—and thankfully easy to fix.
# Go Slices: Small Values, Shared Storage, Surprising Consequences

A Go slice looks like a growable array:

```go
names := []string{"Ada", "Grace"}
names = append(names, "Barbara")
```

But a slice is not the array that stores its elements. It is a small value describing a region of an array. That distinction explains most slice behavior: why changes sometimes affect another slice, why `append` sometimes breaks that connection, and why keeping a tiny slice can keep a large allocation alive.

## The slice and the backing array

Conceptually, a slice contains three fields:

- A pointer to its first element in a backing array.
- A length: the number of elements currently accessible.
- A capacity: the number of elements available from that starting position to the end of its permitted region.

Consider:

```go
s := make([]int, 3, 5)
```

This creates a slice with length three and capacity five. Its backing storage has room for five integers, initially zeroed.

You can access `s[0]`, `s[1]`, and `s[2]`. Accessing `s[3]` panics because indexing checks the **length**, even though the capacity is larger.

You can expose more of the existing storage by reslicing:

```go
s = s[:5]
```

Now all five elements are accessible. Reslicing changes the slice’s description; it does not allocate another array.

Capacity is measured from the slice’s own starting position. Given:

```go
a := [6]int{10, 20, 30, 40, 50, 60}
s := a[2:4]
```

`s` contains `[30 40]`, has length two, and has capacity four. Its available region starts at `a[2]` and extends through `a[5]`.

## Copying a slice shares its elements

Assigning a slice copies its description, not its backing array:

```go
a := []int{1, 2, 3}
b := a

b[0] = 99
fmt.Println(a) // [99 2 3]
```

Both slice values point into the same storage.

Their lengths are independent, however:

```go
b = b[:1]

fmt.Println(len(a)) // 3
fmt.Println(len(b)) // 1
```

Changing `b`’s length does not change `a`’s length. Changing an element through `b` still changes the shared array.

The same distinction applies to function arguments. Go passes slice values by value, so a function receives its own slice description:

```go
func change(s []int) {
    s[0] = 99
    s = s[:1]
}
```

The element assignment is visible to the caller. The length change is not.

## `append` has two possible paths

When you append elements, Go first checks whether the backing array has enough capacity.

If it does, `append` writes the new elements into that array and returns a slice with an increased length:

```go
s := make([]int, 2, 4)
s[0], s[1] = 10, 20

t := append(s, 30)
```

`s` still has length two. `t` has length three. They share storage, so `s[:3]` also exposes the appended `30`.

If there is insufficient capacity, `append` allocates a new backing array, copies the existing elements, adds the new ones, and returns a slice pointing to the new storage:

```go
s := []int{10, 20} // length 2, capacity 2
t := append(s, 30)

t[0] = 99
fmt.Println(s) // [10 20]
```

This explains why you normally write:

```go
s = append(s, value)
```

The returned value carries the new length and potentially a new backing-array pointer. A function that grows a slice should usually return the resulting slice too.

The capacity growth strategy is an implementation detail. Do not build correctness around a rule such as “capacity always doubles.”

## Appending can overwrite another slice’s elements

The most surprising gotcha appears when a slice covers only part of an array:

```go
all := []int{1, 2, 3, 4}
prefix := all[:2]

prefix = append(prefix, 99)

fmt.Println(all) // [1 2 99 4]
```

`prefix` had spare capacity. Its append wrote into the position immediately after its visible elements, which was already visible through `all`.

A full slice expression can prevent that particular overwrite:

```go
prefix := all[:2:2]
prefix = append(prefix, 99)
```

The third index sets the capacity limit. Here, length and capacity are both two, so appending requires new storage.

This does **not** make `prefix` an independent copy. Before it grows, assignments such as `prefix[0] = 99` still modify `all`.

## Copy explicitly when independence matters

To give a slice separate element storage, allocate and copy:

```go
clone := make([]int, len(original))
copy(clone, original)
```

The built-in `copy` copies as many elements as fit in both slices and safely handles overlapping regions.

This is a shallow copy. If the elements contain pointers, maps, or other slices, those nested values can still refer to shared data. Copying `[][]int`, for example, copies the inner slice descriptions, not their backing arrays.

## Small slices can retain large allocations

A subslice generally keeps its entire backing array reachable:

```go
large := make([]byte, 10_000_000)
small := large[:10]
large = nil
```

Keeping `small` can keep the large allocation alive. Reducing its capacity with `small[:10:10]` does not release that allocation.

If the small result must live much longer, copy it into separate storage.

There is another retention trap with pointer-containing elements: shortening a slice does not erase the discarded entries. Those entries can keep objects reachable. When removing elements from storage you continue to retain, zero the unused slots when appropriate, remembering that aliases observe those writes.

## Nil, empty, and concurrent use

A nil slice has length and capacity zero and supports `append`:

```go
var s []int
s = append(s, 1)
```

An empty, non-nil slice also has length zero. Both support ranging and appending, but they differ when compared with `nil` and can differ during serialization.

Finally, shared backing arrays mean shared mutable memory. Copying a slice description provides no synchronization. Concurrent access to overlapping elements, including writes caused by `append`, needs coordination.

Whenever slice behavior seems surprising, track two things separately: the slice’s pointer, length, and capacity, and the array those fields describe.
# Go Slices: A Pointer, Two Ints, and a Lot of Surprises

Slices are probably the most-used data structure in our codebase. You've written `append` a thousand times, and most of those times it did what you expected. This post covers the other times. Once you know what a slice actually is, those "wait, why did that change?" bugs mostly stop being mysterious.

## What a slice actually is

A slice is a small struct with three fields. The runtime defines it roughly like this:

```go
type slice struct {
    array unsafe.Pointer // pointer to the backing array
    len   int            // number of elements you can see
    cap   int            // number of elements available from array onward
}
```

That's 24 bytes on a 64-bit machine. The elements live in a separate **backing array**, and the slice is a window onto part of it.

When you pass a slice to a function or assign it to another variable, you copy those 24 bytes. You don't copy the data. Two slices can point at the same backing array, and almost every gotcha below comes from that.

## Length vs. capacity

- **`len`** is how many elements you can index right now. Reading `s[len(s)]` panics.
- **`cap`** is how many elements exist in the backing array, counting from the slice's first element to the end of the array.

```go
s := make([]int, 3, 10)
fmt.Println(len(s), cap(s)) // 3 10
```

There are seven unused slots after the visible three. You can't index them, but `append` can write into them, and so can a reslice like `s[:5]`.

Reslicing creates a new header and leaves the data where it is:

```go
a := []int{0, 1, 2, 3, 4, 5}
b := a[2:4]
fmt.Println(b, len(b), cap(b)) // [2 3] 2 4
```

`b` starts at `a[2]`, so its capacity runs to the end of `a`'s backing array, which is 4 slots.

## How `append` works

`append(s, x)` makes one decision:

1. **If `len(s) < cap(s)`**, it writes `x` into the next slot of the *existing* backing array and returns a header with `len+1`.
2. **Otherwise**, it allocates a bigger array, copies everything over, writes `x`, and returns a header pointing at the *new* array.

That's why you always write `s = append(s, x)`. The returned header might have a new pointer, and it definitely has a new length.

For growth, small slices roughly double. Since Go 1.18, once you're past 256 elements the growth factor eases down toward about 1.25x. The runtime also rounds up to allocator size classes, so the exact capacity you end up with is an implementation detail. Don't depend on it.

## Gotcha #1: Appending through a subslice overwrites the original

```go
a := []int{1, 2, 3, 4}
b := a[:2]
b = append(b, 99)
fmt.Println(a) // [1 2 99 4]
```

`b` had length 2 and capacity 4, so `append` wrote into `a[2]`. Nothing panicked and no warning appeared, but your data changed anyway.

## Gotcha #2: Two appends, one slot

Same problem, harder to spot:

```go
x := make([]int, 3, 10)
y := append(x, 1)
z := append(x, 2)
fmt.Println(y[3], z[3]) // 2 2
```

Both appends wrote to the same slot, `x`'s backing array at index 3. `y` and `z` are the same memory under different names. This one turns up in recursive code that builds paths or combinations, where you append to a shared prefix in a loop and every result comes back identical.

## The fix for both: full slice expressions

Go has a three-index slice, `s[low:high:max]`, that caps the capacity:

```go
b := a[:2:2] // len 2, cap 2
b = append(b, 99) // no room, so append allocates a new array
fmt.Println(a) // [1 2 3 4], untouched
```

If you're returning a subslice to code you don't control, cap it, or hand back a copy:

```go
out := slices.Clone(a[:2]) // Go 1.21+
```

## Gotcha #3: Appending inside a function

```go
func addOne(s []int) {
    s = append(s, 1)
}

s := make([]int, 0, 5)
addOne(s)
fmt.Println(s, len(s)) // [] 0
```

The function got a copy of the header and appended to its own copy. The caller's `len` is still 0. The backing array *did* get written, though, since there was room. The caller just can't see that slot. If you reslice with `s[:1]`, the `1` is sitting there.

The rule is to return the slice (`s = addOne(s)`), the way `append` itself does. Passing `*[]int` also works, but it's rarely the nicer option.

## Gotcha #4: Small slices pinning big arrays

```go
func readHeader(path string) []byte {
    data, _ := os.ReadFile(path) // say, 200 MB
    return data[:16]
}
```

You return 16 bytes, but the header still points into the 200 MB backing array, so the GC can't free any of it. Keep a few thousand of these in a cache and you'll have a memory graph worth investigating.

Copy out what you need:

```go
return bytes.Clone(data[:16])
```

This applies to pointer-heavy slices too. If you shrink `s = s[:n]`, the elements past `n` still hold references until you overwrite them. `slices.Delete` clears the tail for this reason (Go 1.22+). If you're trimming manually, `clear(s[n:])` before reslicing does the same thing.

## Gotcha #5: nil vs. empty

```go
var a []int          // nil, len 0
b := []int{}         // non-nil, len 0
```

`len`, `range`, and `append` treat these the same, so always check emptiness with `len(s) == 0`, not `s == nil`. The difference shows up at boundaries. `encoding/json` marshals `a` as `null` and `b` as `[]`. If a frontend expects an array, that's a fun ticket to get on a Friday.

## Cheat sheet

- A slice is `{ptr, len, cap}`. Copying a slice copies the header, not the data.
- `append` writes in place when there's capacity and reallocates when there isn't. Always reassign the result.
- Subslices share memory. Use `s[a:b:b]` or `slices.Clone` when you need independence.
- Functions that append should return the slice.
- Clone small pieces of large buffers before holding onto them.
- Check `len(s) == 0`, and think about nil vs. empty when serializing.

If you want to see this for yourself, put a few `fmt.Printf("%p %d %d\n", s, len(s), cap(s))` calls into a scratch file and watch the pointer change as you append. Ten minutes of that is a good way to make all of this stick.

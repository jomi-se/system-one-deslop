# How Go Slices Work, and the Bugs That Follow From It

Here is a small helper that builds file paths from a shared prefix. It looks harmless, and in a quick test it might even appear to work.

```go
func withSuffix(base []string, suffix string) []string {
    return append(base, suffix)
}

prefix := make([]string, 0, 4)
prefix = append(prefix, "usr", "local")

bin := withSuffix(prefix, "bin")
lib := withSuffix(prefix, "lib")

fmt.Println(bin, lib) // [usr local lib] [usr local lib]
```

Both results end in `lib`. The second call overwrote the first one's data, even though `bin` and `lib` are separate variables and neither function modified `prefix` in any visible way. To see why, you have to look at what a slice value actually contains.

## The slice header

In the runtime, a slice is a three-field struct:

```go
type slice struct {
    array unsafe.Pointer
    len   int
    cap   int
}
```

When you pass a slice to a function, assign it to another variable, or return it, you copy these three words and nothing else. The elements live in a separate backing array, and every copy of the header points at the same one. That is why writing `s[0] = x` inside a function is visible to the caller: the write goes through the pointer into memory that both headers share.

`append` is where this becomes subtle. It looks at the header it was given and asks whether `len < cap`. If there is room, it writes the new element at index `len` in the existing array and returns a header with `len + 1`. If there is no room, it allocates a larger array, copies the old elements over, writes the new one, and returns a header pointing at the new array. In the example above, `prefix` had length 2 and capacity 4, so both calls to `withSuffix` found room and both wrote into index 2 of the same array. `bin` and `lib` are two headers of length 3 looking at identical memory, and whichever call ran last decided what index 2 holds.

## Behavior that depends on capacity

The uncomfortable part is that the same code shares memory in one case and doesn't in another, depending on a number you rarely look at.

```go
s := []int{1, 2, 3} // len 3, cap 3

t := append(s, 4)   // no room: new array
t[0] = 99
fmt.Println(s)      // [1 2 3]

u := s[:2]          // len 2, cap 3
v := append(u, 4)   // room: writes into s[2]
fmt.Println(s, v)   // [1 2 4] [1 2 4]
```

A slice literal has capacity equal to its length, so the first `append` reallocates and `t` is independent of `s`. Reslicing with `s[:2]` shrinks the length but keeps the capacity, so the second `append` lands in the slot that `s[2]` still occupies. Tests written with literals tend to take the first path, while production code that builds slices with `make` or repeated appends tends to take the second, and that is how this kind of aliasing bug survives review.

When growth does happen, the new capacity roughly doubles for small slices and grows by a smaller factor for large ones, then gets rounded up to fit the allocator's size classes. You shouldn't rely on the exact numbers, which have changed between Go releases, but the consequence matters: after enough appends, a slice almost always has spare capacity, which means the next `append` from a copy of its header will almost always write into shared memory.

The fix is to take away the spare capacity before handing a slice to code that might append to it. Go's full slice expression, `s[lo:hi:max]`, sets the capacity explicitly, and `slices.Clip` does the common case for you:

```go
func withSuffix(base []string, suffix string) []string {
    return append(slices.Clip(base), suffix)
}
```

With capacity equal to length, `append` has no choice but to allocate, and each caller gets its own array. If you would rather not think about it at all, `slices.Clone` makes the independence explicit at the cost of a copy.

The other half of the `append` contract follows from the same header semantics. A function like this one does nothing useful:

```go
func addItem(items []int) {
    items = append(items, 42)
}
```

It may write 42 into the caller's backing array if there is room, but the caller's header still has the old length, so the caller never sees it. This is why `append` returns a value and why the idiom is always `s = append(s, x)`. If a function needs to grow a slice, it has to return the new header or take a pointer to one.

## Holding on to more than you think

Here is a function that reads the first line of a file:

```go
func firstLine(path string) ([]byte, error) {
    data, err := os.ReadFile(path)
    if err != nil {
        return nil, err
    }
    if i := bytes.IndexByte(data, '\n'); i >= 0 {
        return data[:i], nil
    }
    return data, nil
}
```

If the file is 200 MB and the first line is 40 bytes, the caller receives a 40-byte slice whose pointer still refers to the 200 MB array. The garbage collector tracks the array, not the portion of it you're using, so the whole file stays in memory for as long as that small slice is reachable. Returning `bytes.Clone(data[:i])` copies the 40 bytes into a fresh allocation and lets the large one be collected.

A related version shows up with slices of pointers. If you remove the last few elements by reslicing to `s[:n]`, the pointers in the tail are still sitting in the backing array, invisible to your code but visible to the collector, and the objects they refer to stay alive. Since Go 1.22, `slices.Delete` and `slices.Compact` zero out the vacated elements for exactly this reason, which is a good argument for using them instead of hand-written reslicing.

## Nil and empty

Finally, two slices that behave identically almost everywhere:

```go
var a []string   // nil
b := []string{}  // empty, non-nil

out1, _ := json.Marshal(a) // null
out2, _ := json.Marshal(b) // []
```

Both have length and capacity zero, both work with `range`, `len`, and `append`, and neither will panic. The only difference is that `a` has a nil pointer in its header and `b` has a non-nil one, and a handful of things inspect that pointer: `encoding/json`, `reflect.DeepEqual`, and any code that compares against `nil` directly. If an API response needs to contain an empty array rather than `null`, initialize the field with an empty literal rather than leaving it at its zero value.

All of these problems come from the same place. A slice is a small value that describes a window onto memory it doesn't own, and most surprises happen when two windows overlap, when a window keeps a large array alive, or when someone changes the window's length without passing the new header back. Once you start asking what the length, capacity, and pointer are at each step, the behavior stops looking arbitrary.

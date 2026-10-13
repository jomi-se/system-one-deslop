# What a Go Slice Actually Is

Here is a function that looks correct and returns the wrong answer. It is meant to generate every subset of a list of numbers using ordinary backtracking:

```go
func subsets(nums []int) [][]int {
    var res [][]int
    var cur []int
    var walk func(i int)
    walk = func(i int) {
        if i == len(nums) {
            res = append(res, cur)
            return
        }
        walk(i + 1)
        cur = append(cur, nums[i])
        walk(i + 1)
        cur = cur[:len(cur)-1]
    }
    walk(0)
    return res
}
```

Call it with `[]int{1, 2, 3}` and you get eight results, the correct count, but several of them hold the same numbers, and the subsets you expected are missing. The function stores `cur` in `res` and then keeps modifying `cur`. In most languages with a growable list type, you would immediately ask whether `res` holds copies or references. In Go the honest answer is "sort of both," and making sense of that requires knowing what a slice value is.

A slice is a small struct with three fields: a pointer to an element in some underlying array, a length, and a capacity. When you write `res = append(res, cur)`, you copy that three-word header into `res`. You do not copy the integers. Every entry in `res` points into whatever array `cur` was using at the time, and the backtracking keeps overwriting that array. The fix is to copy the contents explicitly, with `slices.Clone(cur)` or `append([]int(nil), cur...)`, before storing them.

## Slicing shares, it doesn't copy

The sharing is easiest to see with a plain array:

```go
arr := [5]int{1, 2, 3, 4, 5}
s := arr[1:3]
fmt.Println(s, len(s), cap(s)) // [2 3] 2 4
s[0] = 99
fmt.Println(arr)               // [1 99 3 4 5]
```

`s` has length 2 because it covers indexes 1 and 2. Its capacity is 4 because the capacity counts from where the slice starts to the end of the underlying array, and four elements remain from index 1 onward. Writing through `s` writes into `arr`, since there is only one block of memory and `s` is a window onto it. Re-slicing `s[:4]` is legal, even though `s` currently has only two elements, because you're still inside its capacity, and it will show you `3, 4, 5` that were there all along.

## When append writes in place

Capacity matters most when you call `append`. Consider this:

```go
a := make([]int, 3, 4)
b := append(a, 1)
c := append(a, 2)
fmt.Println(b[3], c[3]) // 2 2
```

`a` has room for one more element, so the first `append` doesn't allocate. It writes `1` into index 3 of the shared array and returns a header with length 4. The second `append` starts from `a` again, which still has length 3, finds the same free slot, and writes `2` there. `b` and `c` are two headers over the same four integers, so both of them see `2`. If `a` had been created with capacity 3 instead, each `append` would have allocated a fresh array, copied the three elements over, and the program would print `1 2`. The same code behaves differently depending on a number that is easy to forget is there.

When `append` does need more room, the runtime allocates a larger array, copies the existing elements, and returns a header that points at the new memory. For small slices the capacity roughly doubles. Past a few hundred elements the growth factor tapers toward about 1.25, and the result is then rounded up to fit the allocator's size classes, so you shouldn't write code that depends on the exact capacity after an `append`. What you can rely on is that after a reallocation the old and new slices no longer share memory. Before it, they do.

## Why append returns a value

This is also why a function like this one doesn't seem to work:

```go
func addDefault(tags []string) {
    tags = append(tags, "untagged")
}
```

The function receives a copy of the caller's header. `append` may write `"untagged"` into the caller's backing array if there is spare capacity, but it updates only the local `tags` variable's length, so the caller's slice still reports the old length and never shows the new element. If the capacity was exhausted, the write went to a new array that the caller has no reference to at all. Either way the caller doesn't see the change, which is why the standard pattern is `tags = addDefault(tags)`, mirroring `append` itself. Assigning to an existing index, `tags[0] = "x"`, behaves differently, because it writes through the shared pointer and the caller does see that change.

## Small slices that keep big arrays alive

A different problem shows up in a profiler rather than in test output:

```go
func header(path string) ([]byte, error) {
    data, err := os.ReadFile(path)
    if err != nil {
        return nil, err
    }
    return data[:64], nil
}
```

If the file is 200 MB and you cache the returned header for each of a few hundred files, you are keeping every one of those 200 MB arrays alive. The garbage collector tracks the underlying array, not the visible window, so a 64-byte slice pins its whole allocation. Returning `bytes.Clone(data[:64])` costs a small copy and lets the large buffer be freed. The same reasoning applies when you shrink a slice of pointers with `s = s[:len(s)-1]`. The removed element is still in the array, still reachable by the collector, so the object it points to can't be freed. `slices.Delete` has zeroed the vacated tail since Go 1.22, which handles this for you. If you trim by hand, set the old slot to `nil` first.

## Limiting what a caller can overwrite

Sometimes you want to hand out a view of your data without copying it, but also without letting the caller's `append` scribble over the elements that follow. The three-index slice expression does this:

```go
view := buf[0:n:n]
```

The third index sets the capacity, here equal to the length. Any `append` on `view` finds no spare room, so it must allocate, and `buf` beyond `n` stays untouched. The cost is one possible allocation in the caller, and in exchange you avoid the aliasing bug from the `a`, `b`, `c` example above.

One last distinction concerns serialization rather than memory. A `nil` slice and an empty non-nil slice both have length zero, and `len`, `range`, and `append` treat them identically, so most code never needs to tell them apart. `encoding/json` does distinguish them, encoding the first as `null` and the second as `[]`. If an API client expects an array, initialize the field with `[]T{}` rather than leaving it at its zero value.

# Decensor

Experimental tool to obfuscate suspected trigger words from algorithmic censorship on platforms such as Facebook and YouTube, while keeping them human-readable, and without resorting to baby-talk like "unalive", "PDF file", "cheese pizza", etc.

## Usage

### Interactive

```sh
decensor
```

### Supplying plain text as argument

```sh
decensor "Epstein didn't kill himself."
```

### With a file

```sh
cat input.txt | decensor
```

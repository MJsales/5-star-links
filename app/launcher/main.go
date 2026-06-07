package main

import (
	_ "embed"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"syscall"
	"unsafe"
)

//go:embed splicer.exe
var splicerBin []byte

func main() {
	kernel32 := syscall.NewLazyDLL("kernel32.dll")
	setConsoleTitle := kernel32.NewProc("SetConsoleTitleW")
	setConsoleTitle.Call(uintptr(unsafe.Pointer(syscall.StringToUTF16Ptr("5 Star Links - AI Video Splicer"))))

	splicerPath := filepath.Join(os.TempDir(), "5star-splicer-v1.exe")

	os.Remove(splicerPath)

	if err := os.WriteFile(splicerPath, splicerBin, 0755); err != nil {
		fmt.Println("Error extracting splicer:", err)
		fmt.Println("Press Enter to exit...")
		fmt.Scanln()
		os.Exit(1)
	}

	cmd := exec.Command(splicerPath, os.Args[1:]...)
	cmd.Stdin = os.Stdin
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr

	err := cmd.Run()

	os.Remove(splicerPath)

	if err != nil {
		fmt.Printf("Error running splicer: %v\n", err)
		fmt.Println("Press Enter to exit...")
		fmt.Scanln()
		os.Exit(1)
	}
}

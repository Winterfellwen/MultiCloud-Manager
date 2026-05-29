package main

import (
	"fmt"
	"os"
)

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8099"
	}
	fmt.Printf("Server starting on :%s\n", port)
}
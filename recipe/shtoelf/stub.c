#include <fcntl.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>

// the handler appends: [script][u32le script size][magic]
#define MAGIC "CONVERT"

int main() {
  unsigned int size;
  char magic[8];
  int fd = open("/proc/self/exe", O_RDONLY);
  lseek(fd, -12, SEEK_END);
  read(fd, &size, 4);
  read(fd, magic, 8);
  if (memcmp(magic, MAGIC, 8) != 0) {
    write(2, "shtoelf: no script attached\n", 28);
    return 1;
  }

  char *cmd = malloc(size + 1);
  lseek(fd, -12 - (off_t)size, SEEK_END);
  read(fd, cmd, size);
  close(fd);

  cmd[size] = '\0';
  execl("/bin/bash", "bash", "-c", cmd, NULL);
}

// gcc -o stub.elf stub.c

#include <fcntl.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>

// https://xkcd.com/221
int cmd_size = 1273991571;

int main() {
  int fd = open("/proc/self/exe", O_RDONLY);
  lseek(fd, -cmd_size, SEEK_END);
  
  char *cmd = malloc(cmd_size + 1);
  read(fd, cmd, cmd_size);
  close(fd);

  cmd[cmd_size] = '\0';
  execl("/bin/bash", "bash", "-c", cmd, NULL);
}
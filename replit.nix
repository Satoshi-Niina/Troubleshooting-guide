
{ pkgs }: {
  deps = [
    pkgs.jq
    pkgs.imagemagick
    pkgs.unzip
    pkgs.postgresql
    pkgs.libuuid
    pkgs.pkg-config
    pkgs.libGL
    pkgs.cairo
    pkgs.pango
    pkgs.pixman
  ];
}

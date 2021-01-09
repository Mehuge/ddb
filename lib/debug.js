
const KB = 1 << 10;
const MB = KB << 10;
const GB = MB << 10;

function F(b) {
  if (b > GB) return (b/GB).toFixed(1)+'/GiB';
  if (b > MB) return (b/MB).toFixed(1)+'/MiB';
  if (b > KB) return (b/KB).toFixed(1)+'/KiB';
  if (b > 1) return b + " bytes";
  return "1 byte";
}
function mem() {
  const usage = process.memoryUsage();
  console.log(
    'MEM:',
    'Process Total', F(usage.rss),
    'Heap Total', F(usage.heapTotal),
    'Heap Used', F(usage.heapUsed),
    'External', F(usage.external)
  );
}

module.exports = {
  mem
};

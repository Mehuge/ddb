
const KB = 1 << 10;
const MB = KB << 10;
const GB = MB << 10;

const memoryUsage = {
  peak: 0,
  low: undefined,
}

function memtrack() {
  const used = memused();
  if (used > memoryUsage.peak) memoryUsage.peak = used;
  if (used < memoryUsage.low || memoryUsage.low == undefined) memoryUsage.low = used;
}

function memstats() {
  console.log('MEM: Heap Usage', 'Min', F(memoryUsage.low), 'Max', F(memoryUsage.peak));
  memdbg();
}

function F(b) {
  if (b > GB) return (b/GB).toFixed(1)+'/GiB';
  if (b > MB) return (b/MB).toFixed(1)+'/MiB';
  if (b > KB) return (b/KB).toFixed(1)+'/KiB';
  if (b > 1) return b + " bytes";
  return "1 byte";
}
function memdbg() {
  const usage = process.memoryUsage();
  console.log(
    'MEM:',
    'Process Total', F(usage.rss),
    'Heap Total', F(usage.heapTotal),
    'External', F(usage.external)
  );
}

function memused() {
  return process.memoryUsage().heapUsed;
}


module.exports = {
  memstats,
  memused,
  memtrack,
  memdbg,
};

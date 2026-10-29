import {zipSync,strToU8} from 'fflate';
import {crc32} from 'node:zlib';
import {open} from 'node:fs/promises';
import {readFileSync} from 'node:fs';
export const largeTakeoutImage=readFileSync(new URL('../public/favicon-32x32.png',import.meta.url));

// A valid 450 MiB stored HTML entry plus small real Keep JSON/image entries.
// The unit-test Blob is virtual; writeTo creates the same archive on disk for
// the browser file picker. No large source buffer is allocated.
export function largeTakeoutFixture() {
  const filler='Takeout/Keep/unused.html',holeBytes=450*1024*1024;
  const small=zipSync({[filler]:[new Uint8Array(),{level:0}],
    'Takeout/Keep/note.json':strToU8(JSON.stringify({title:'Large Takeout fixture',textContent:'A note from a 450 MiB ZIP',attachments:[{filePath:'image.png'}]})),
    'Takeout/Keep/image.png':largeTakeoutImage});
  const header=new DataView(small.buffer,small.byteOffset,small.byteLength),end=small.length-22;
  const directory=header.getUint32(end+16,true),start=30+header.getUint16(26,true)+header.getUint16(28,true);
  let checksum=0;const zeros=new Uint8Array(1024*1024);for(let i=0;i<450;i++)checksum=crc32(zeros,checksum);
  header.setUint32(14,checksum,true);header.setUint32(18,holeBytes,true);header.setUint32(22,holeBytes,true);
  for(let offset=directory;offset<end;) {
    const length=header.getUint16(offset+28,true),name=new TextDecoder().decode(small.subarray(offset+46,offset+46+length));
    if(name===filler){header.setUint32(offset+16,checksum,true);header.setUint32(offset+20,holeBytes,true);header.setUint32(offset+24,holeBytes,true);}
    else header.setUint32(offset+42,header.getUint32(offset+42,true)+holeBytes,true);
    offset+=46+length+header.getUint16(offset+30,true)+header.getUint16(offset+32,true);
  }
  header.setUint32(end+16,directory+holeBytes,true);
  const prefix=small.slice(0,start),suffix=small.slice(start),size=small.length+holeBytes,reads=[];
  return {name:'large-takeout.zip',size,reads,
    arrayBuffer(){throw Error('The whole archive must never be read');},
    slice(from,to){
      reads.push([from,to]);const parts=[];
      if(from<prefix.length)parts.push(prefix.slice(from,Math.min(to,prefix.length)));
      const a=Math.max(from,prefix.length),b=Math.min(to,prefix.length+holeBytes);
      if(b>a){if(b-a>65557)throw Error('Unexpected large filler read');parts.push(new Uint8Array(b-a));}
      if(to>prefix.length+holeBytes)parts.push(suffix.slice(Math.max(0,from-prefix.length-holeBytes),to-prefix.length-holeBytes));
      return new Blob(parts);
    },
    async writeTo(file){const handle=await open(file,'w');try{await handle.write(prefix,0,prefix.length,0);await handle.write(suffix,0,suffix.length,prefix.length+holeBytes);await handle.truncate(size);}finally{await handle.close();}}
  };
}

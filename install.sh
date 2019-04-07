#!/bin/bash
git clone https://github.com/mehuge/ddb
if test -d ddb ; then
  mv "ddb" "ddb.git"
  ( cd ddb.git && npm i )
  case "$(uname -s)" in
  CYGWIN*) DDB="\$(cygpath -w '$PWD/ddb.git/ddb.js')" ;;
  *) DDB="$PWD/ddb.git/ddb.js" ;;
  esac
  { echo "#!/bin/bash"
    echo "exec node $DDB \"\$@\""
  } >ddb
  chmod +x ddb
fi

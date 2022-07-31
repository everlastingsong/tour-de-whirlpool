#!/bin/bash

LANG_LIST="JP EN CN"

for lang in $LANG_LIST
do
    echo "target languaage: $lang"

    # make grep -v filter
    filter=""
    for l in $LANG_LIST
    do
        if [[ "$l" != "$lang" ]]; then
            if [ -n "$filter" ]; then
                filter="$filter|"
            fi
            filter="$filter//LANG:$l"
        fi
    done
    echo "  egrep filter: $filter"

    # make sed command
    command="s/LANG:${lang}//"
    echo "  sed command: $command"

    # generate
    mkdir -p target/$lang
    for f in $(ls src/)
    do
        echo "  generate: target/$lang/$f"
        grep -v -E $filter src/$f | sed $command > target/$lang/$f
    done
done

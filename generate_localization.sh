#!/bin/bash

SRC_DIR="src_i18n"
TARGET_DIR="src"
LANG_LIST="JP EN"

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
    echo "  grep filter: $filter"

    # make sed command
    command="s/LANG:${lang}//"
    echo "  sed command: $command"

    # generate
    mkdir -p $TARGET_DIR/$lang
    for f in $(ls $SRC_DIR)
    do
        echo "  generate: $TARGET_DIR/$lang/$f"
        grep -v -E $filter $SRC_DIR/$f | sed $command > $TARGET_DIR/$lang/$f
    done
done

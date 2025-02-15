// Copyright 2025, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

package wsaveconfig

import (
	"fmt"
	"io/fs"
	"os"
	"path/filepath"

	"github.com/tailscale/hujson"
	"github.com/wavetermdev/waveterm/pkg/wavebase"
	"github.com/wavetermdev/waveterm/pkg/waveobj"
	"github.com/wavetermdev/waveterm/pkg/wconfig"
	"github.com/wavetermdev/waveterm/pkg/wshrpc"
	"github.com/wavetermdev/waveterm/pkg/wshrpc/wshclient"
	"github.com/wavetermdev/waveterm/pkg/wshutil"
)

func readConfigFileFSRaw(fsys fs.FS, fileName string) ([]byte, error) {
	barr, readErr := fs.ReadFile(fsys, fileName)
	if readErr != nil {
		// If we get an error, we may be using the wrong path separator for the given FS interface. Try switching the separator.
		barr, readErr = fs.ReadFile(fsys, filepath.ToSlash(fileName))
	}
	return barr, readErr
}

func SetConnectionsConfigValue(connName string, toMerge waveobj.MetaMapType) error {
	originalM, cerrs := wconfig.ReadWaveHomeConfigFile(wconfig.ConnectionsFile)
	if len(cerrs) > 0 {
		return fmt.Errorf("error reading config file: %v", cerrs[0])
	}
	mergedM, err := createMergedConnections(connName, toMerge)
	if err != nil {
		return fmt.Errorf("error merging config: %w", err)
	}
	jsonCompare := wshrpc.JsonCompare{
		Original: originalM,
		Modified: mergedM,
	}
	rpcClient := wshclient.GetBareRpcClient()
	patchStr, err := wshclient.CreateJsonPatchCommand(rpcClient, jsonCompare, &wshrpc.RpcOpts{
		Route: wshutil.ElectronRoute,
	})
	if err != nil {
		return fmt.Errorf("error creating json patch: %w", err)
	}
	patchBarr := []byte(patchStr)

	mTarget, err := jsonMarshallHujson(wconfig.ConnectionsFile)
	if err != nil {
		return fmt.Errorf("cannot parse hujson: %w", err)
	}
	err = mTarget.Patch(patchBarr)
	if err != nil {
		return fmt.Errorf("failed to apply patch: %w", err)
	}
	outBarr := mTarget.Pack()
	outBarr, err = hujson.Format(outBarr)
	if err != nil {
		return fmt.Errorf("failed to format: %w", err)
	}
	return writeWaveHomeConfigFile(wconfig.ConnectionsFile, outBarr)
}

func writeWaveHomeConfigFile(fileName string, barr []byte) error {
	configDirAbsPath := wavebase.GetWaveConfigDir()
	fullFileName := filepath.Join(configDirAbsPath, fileName)
	return os.WriteFile(fullFileName, barr, 0644)
}

func createMergedConnections(connName string, toMerge waveobj.MetaMapType) (waveobj.MetaMapType, error) {
	m, cerrs := wconfig.ReadWaveHomeConfigFile(wconfig.ConnectionsFile)
	if len(cerrs) > 0 {
		return nil, fmt.Errorf("error reading config file: %v", cerrs[0])
	}
	if m == nil {
		m = make(waveobj.MetaMapType)
	}
	connData := m.GetMap(connName)
	if connData == nil {
		connData = make(waveobj.MetaMapType)
	}
	for configKey, val := range toMerge {
		if val == nil {
			delete(connData, configKey)
			continue
		}
		connData[configKey] = val
	}
	m[connName] = connData
	return m, nil
}

func jsonMarshallHujson(filename string) (*hujson.Value, error) {
	configDirAbsPath := wavebase.GetWaveConfigDir()
	configDirFsys := os.DirFS(configDirAbsPath)
	barr, err := readConfigFileFSRaw(configDirFsys, filename)
	if err != nil {
		// TODO just create one from scratch instead (still can fail if the newly created cannot be opened)
		return nil, fmt.Errorf("unable to read existing config file: %w", err)
	}
	outConfig, err := hujson.Parse(barr)
	return &outConfig, err
}

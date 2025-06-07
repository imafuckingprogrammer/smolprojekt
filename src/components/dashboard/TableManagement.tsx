import { useState, useEffect } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabase';
import { LoadingSpinner } from '../ui/LoadingSpinner';
import { generateQRToken, generateQRCode, downloadQRCode, printQRCode } from '../../lib/qr-generator';
import type { RestaurantTable } from '../../types/database';
import {
  PlusIcon,
  QrCodeIcon,
  PrinterIcon,
  ArrowDownTrayIcon,
  TrashIcon,
  EyeIcon,
  XMarkIcon
} from '@heroicons/react/24/outline';

export function TableManagement() {
  const { restaurant } = useAuth();
  const [tables, setTables] = useState<RestaurantTable[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newTableNumber, setNewTableNumber] = useState('');
  const [selectedTable, setSelectedTable] = useState<RestaurantTable | null>(null);
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string>('');
  const [generatingQR, setGeneratingQR] = useState(false);

  useEffect(() => {
    if (restaurant) {
      fetchTables();
    }
  }, [restaurant]);

  const fetchTables = async () => {
    if (!restaurant) return;

    try {
      const { data, error } = await supabase
        .from('restaurant_tables')
        .select('*')
        .eq('restaurant_id', restaurant.id)
        .order('table_number', { ascending: true });

      if (error) throw error;
      setTables(data || []);
    } catch (error) {
      console.error('Error fetching tables:', error);
    } finally {
      setLoading(false);
    }
  };

  const createTable = async () => {
    if (!restaurant || !newTableNumber) return;

    const tableNumber = parseInt(newTableNumber);
    if (isNaN(tableNumber) || tableNumber <= 0) {
      alert('Please enter a valid table number');
      return;
    }

    if (tables.some(table => table.table_number === tableNumber)) {
      alert('Table number already exists');
      return;
    }

    try {
      setCreating(true);

      const qrToken = generateQRToken(restaurant.id, tableNumber);
      
      const { data, error } = await supabase
        .from('restaurant_tables')
        .insert({
          restaurant_id: restaurant.id,
          table_number: tableNumber,
          qr_token: qrToken,
          is_active: true
        })
        .select()
        .single();

      if (error) throw error;

      setTables(prev => [...prev, data].sort((a, b) => a.table_number - b.table_number));
      setNewTableNumber('');
      setShowAddForm(false);
    } catch (error) {
      console.error('Error creating table:', error);
      alert('Failed to create table');
    } finally {
      setCreating(false);
    }
  };

  const deleteTable = async (tableId: string) => {
    if (!confirm('Are you sure you want to delete this table? This action cannot be undone.')) {
      return;
    }

    try {
      const { error } = await supabase
        .from('restaurant_tables')
        .delete()
        .eq('id', tableId);

      if (error) throw error;

      setTables(prev => prev.filter(table => table.id !== tableId));
    } catch (error) {
      console.error('Error deleting table:', error);
      alert('Failed to delete table');
    }
  };

  const toggleTableStatus = async (table: RestaurantTable) => {
    try {
      const { error } = await supabase
        .from('restaurant_tables')
        .update({ is_active: !table.is_active })
        .eq('id', table.id);

      if (error) throw error;

      setTables(prev => 
        prev.map(t => 
          t.id === table.id ? { ...t, is_active: !t.is_active } : t
        )
      );
    } catch (error) {
      console.error('Error updating table status:', error);
      alert('Failed to update table status');
    }
  };

  const showQRCode = async (table: RestaurantTable) => {
    try {
      setGeneratingQR(true);
      setSelectedTable(table);
      
      const dataUrl = await generateQRCode(table.qr_token);
      setQrCodeDataUrl(dataUrl);
    } catch (error) {
      console.error('Error generating QR code:', error);
      alert('Failed to generate QR code');
    } finally {
      setGeneratingQR(false);
    }
  };

  const handleDownloadQR = () => {
    if (selectedTable && qrCodeDataUrl) {
      downloadQRCode(qrCodeDataUrl, `table-${selectedTable.table_number}-qr.png`);
    }
  };

  const handlePrintQR = () => {
    if (selectedTable && qrCodeDataUrl && restaurant) {
      printQRCode(
        qrCodeDataUrl,
        `Table ${selectedTable.table_number}`,
        restaurant.name
      );
    }
  };

  const createMultipleTables = async () => {
    const count = prompt('How many tables would you like to create?');
    if (!count || !restaurant) return;

    const tableCount = parseInt(count);
    if (isNaN(tableCount) || tableCount <= 0 || tableCount > 50) {
      alert('Please enter a number between 1 and 50');
      return;
    }

    try {
      setCreating(true);

      // Find the highest existing table number
      const maxTableNumber = tables.length > 0 
        ? Math.max(...tables.map(t => t.table_number))
        : 0;

      const newTables = [];
      for (let i = 1; i <= tableCount; i++) {
        const tableNumber = maxTableNumber + i;
        const qrToken = generateQRToken(restaurant.id, tableNumber);
        
        newTables.push({
          restaurant_id: restaurant.id,
          table_number: tableNumber,
          qr_token: qrToken,
          is_active: true
        });
      }

      const { data, error } = await supabase
        .from('restaurant_tables')
        .insert(newTables)
        .select();

      if (error) throw error;

      setTables(prev => [...prev, ...data].sort((a, b) => a.table_number - b.table_number));
    } catch (error) {
      console.error('Error creating tables:', error);
      alert('Failed to create tables');
    } finally {
      setCreating(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Table Management</h1>
          <p className="mt-1 text-sm text-gray-600">
            Manage your restaurant tables and QR codes
          </p>
        </div>
        <div className="flex space-x-3">
          <button
            onClick={createMultipleTables}
            disabled={creating}
            className="btn-secondary"
          >
            Create Multiple Tables
          </button>
          <button
            onClick={() => setShowAddForm(true)}
            disabled={creating}
            className="btn-primary"
          >
            <PlusIcon className="h-4 w-4 mr-2" />
            Add Table
          </button>
        </div>
      </div>

      {/* Add Table Form */}
      {showAddForm && (
        <div className="card mb-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Add New Table</h3>
          <div className="flex items-end space-x-4">
            <div className="flex-1">
              <label htmlFor="tableNumber" className="label">
                Table Number
              </label>
              <input
                id="tableNumber"
                type="number"
                min="1"
                className="input"
                value={newTableNumber}
                onChange={(e) => setNewTableNumber(e.target.value)}
                placeholder="Enter table number"
              />
            </div>
            <div className="flex space-x-2">
              <button
                onClick={createTable}
                disabled={creating || !newTableNumber}
                className="btn-primary"
              >
                {creating ? <LoadingSpinner size="sm" className="mr-2" /> : null}
                Create Table
              </button>
              <button
                onClick={() => {
                  setShowAddForm(false);
                  setNewTableNumber('');
                }}
                className="btn-secondary"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tables Grid */}
      {tables.length === 0 ? (
        <div className="text-center py-12">
          <QrCodeIcon className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-sm font-medium text-gray-900">No tables</h3>
          <p className="mt-1 text-sm text-gray-500">
            Get started by creating your first table.
          </p>
          <div className="mt-6">
            <button
              onClick={() => setShowAddForm(true)}
              className="btn-primary"
            >
              <PlusIcon className="h-4 w-4 mr-2" />
              Add Table
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {tables.map((table) => (
            <div
              key={table.id}
              className={`card border-2 transition-colors ${
                table.is_active
                  ? 'border-green-200 bg-green-50'
                  : 'border-gray-200 bg-gray-50'
              }`}
            >
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-semibold text-gray-900">
                  Table {table.table_number}
                </h3>
                <span
                  className={`badge ${
                    table.is_active ? 'badge-ready' : 'badge-cancelled'
                  }`}
                >
                  {table.is_active ? 'Active' : 'Inactive'}
                </span>
              </div>

              <div className="space-y-2 mb-4">
                <p className="text-sm text-gray-600">
                  QR Token: {table.qr_token.slice(-8)}...
                </p>
                <p className="text-xs text-gray-500">
                  Created: {new Date(table.created_at).toLocaleDateString()}
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => showQRCode(table)}
                  className="flex-1 btn btn-primary text-xs py-1"
                >
                  <EyeIcon className="h-3 w-3 mr-1" />
                  View QR
                </button>
                
                <button
                  onClick={() => toggleTableStatus(table)}
                  className={`flex-1 btn text-xs py-1 ${
                    table.is_active
                      ? 'btn-secondary'
                      : 'btn-primary'
                  }`}
                >
                  {table.is_active ? 'Deactivate' : 'Activate'}
                </button>
                
                <button
                  onClick={() => deleteTable(table.id)}
                  className="btn btn-danger text-xs py-1 px-2"
                >
                  <TrashIcon className="h-3 w-3" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* QR Code Modal */}
      {selectedTable && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-medium text-gray-900">
                Table {selectedTable.table_number} QR Code
              </h3>
              <button
                onClick={() => {
                  setSelectedTable(null);
                  setQrCodeDataUrl('');
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>

            <div className="text-center mb-6">
              {generatingQR ? (
                <div className="flex items-center justify-center h-64">
                  <LoadingSpinner size="lg" />
                </div>
              ) : qrCodeDataUrl ? (
                <img
                  src={qrCodeDataUrl}
                  alt={`QR Code for Table ${selectedTable.table_number}`}
                  className="mx-auto w-64 h-64 border border-gray-200 rounded-lg"
                />
              ) : null}
            </div>

            {qrCodeDataUrl && (
              <div className="flex space-x-3">
                <button
                  onClick={handleDownloadQR}
                  className="flex-1 btn-secondary"
                >
                  <ArrowDownTrayIcon className="h-4 w-4 mr-2" />
                  Download
                </button>
                <button
                  onClick={handlePrintQR}
                  className="flex-1 btn-primary"
                >
                  <PrinterIcon className="h-4 w-4 mr-2" />
                  Print
                </button>
              </div>
            )}

            <div className="mt-4 text-center">
              <p className="text-sm text-gray-500">
                Customers scan this QR code to access your menu
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
} 